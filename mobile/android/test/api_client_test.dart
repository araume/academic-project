import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'package:thesis_lite_mobile/core/network/api_client.dart';
import 'package:thesis_lite_mobile/core/network/api_exception.dart';
import 'package:thesis_lite_mobile/core/storage/token_store.dart';

void main() {
  test('GET retries once on transient 503 and succeeds', () async {
    final client = _SequenceClient(
      responses: [
        (_) => _jsonResponse(503, <String, dynamic>{'message': 'try later'}),
        (_) => _jsonResponse(200, <String, dynamic>{'ok': true}),
      ],
    );

    final apiClient = ApiClient(
      baseUrl: 'https://api.example.com',
      tokenStore: _FakeTokenStore(),
      httpClient: client,
      maxGetRetries: 1,
      retryBaseDelay: Duration.zero,
    );

    final response = await apiClient.getJson('/api/ping');

    expect(response.statusCode, 200);
    expect(response.data['ok'], true);
    expect(client.callCount, 2);
  });

  test('POST does not retry on 503', () async {
    final client = _SequenceClient(
      responses: [
        (_) => _jsonResponse(503, <String, dynamic>{'message': 'server down'}),
      ],
    );

    final apiClient = ApiClient(
      baseUrl: 'https://api.example.com',
      tokenStore: _FakeTokenStore(),
      httpClient: client,
      maxGetRetries: 3,
      retryBaseDelay: Duration.zero,
    );

    await expectLater(
      () => apiClient.postJson('/api/ping', body: <String, dynamic>{'x': 1}),
      throwsA(
        isA<ApiException>().having((e) => e.statusCode, 'statusCode', 503),
      ),
    );

    expect(client.callCount, 1);
  });

  test('GET timeout is mapped to NetworkException after retries', () async {
    final client = _SequenceClient(
      responses: [
        (_) => throw TimeoutException('timeout'),
        (_) => throw TimeoutException('timeout again'),
      ],
    );

    final apiClient = ApiClient(
      baseUrl: 'https://api.example.com',
      tokenStore: _FakeTokenStore(),
      httpClient: client,
      maxGetRetries: 1,
      retryBaseDelay: Duration.zero,
      requestTimeout: const Duration(milliseconds: 10),
    );

    await expectLater(
      () => apiClient.getJson('/api/ping'),
      throwsA(
        isA<NetworkException>().having((e) => e.statusCode, 'statusCode', 0),
      ),
    );

    expect(client.callCount, 2);
  });

  test('Authorization header is attached when token exists', () async {
    final client = _SequenceClient(
      responses: [
        (request) {
          expect(request.headers['Authorization'], 'Bearer token-123');
          return _jsonResponse(200, <String, dynamic>{'ok': true});
        },
      ],
    );

    final apiClient = ApiClient(
      baseUrl: 'https://api.example.com',
      tokenStore: _FakeTokenStore(token: 'token-123'),
      httpClient: client,
      retryBaseDelay: Duration.zero,
    );

    final response = await apiClient.getJson('/api/ping');
    expect(response.data['ok'], true);
  });
}

class _SequenceClient extends http.BaseClient {
  _SequenceClient({required this.responses});

  final List<http.Response Function(http.BaseRequest request)> responses;
  int callCount = 0;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    if (callCount >= responses.length) {
      throw StateError('No stubbed response for call index $callCount');
    }

    final responseFactory = responses[callCount];
    callCount += 1;
    final response = responseFactory(request);

    return http.StreamedResponse(
      Stream<List<int>>.value(utf8.encode(response.body)),
      response.statusCode,
      headers: response.headers,
      reasonPhrase: response.reasonPhrase,
      request: request,
    );
  }
}

http.Response _jsonResponse(int statusCode, Map<String, dynamic> body) {
  return http.Response(
    jsonEncode(body),
    statusCode,
    headers: <String, String>{
      'content-type': 'application/json',
    },
  );
}

class _FakeTokenStore extends TokenStore {
  _FakeTokenStore({this.token}) : super(storage: const FlutterSecureStorage());

  final String? token;

  @override
  Future<void> clear() async {}

  @override
  Future<String?> readToken() async => token;

  @override
  Future<void> writeToken(String token) async {}
}
