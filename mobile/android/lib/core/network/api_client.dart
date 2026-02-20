import 'dart:convert';

import 'package:http/http.dart' as http;

import '../storage/token_store.dart';
import 'api_exception.dart';

class ApiResponse {
  ApiResponse({
    required this.statusCode,
    required this.data,
  });

  final int statusCode;
  final Map<String, dynamic> data;
}

class ApiClient {
  ApiClient({
    required this.baseUrl,
    required this.tokenStore,
    http.Client? httpClient,
  }) : _httpClient = httpClient ?? http.Client();

  final String baseUrl;
  final TokenStore tokenStore;
  final http.Client _httpClient;

  Future<ApiResponse> getJson(
    String path, {
    Map<String, String>? query,
    bool authenticated = true,
  }) {
    return _requestJson(
      method: 'GET',
      path: path,
      query: query,
      authenticated: authenticated,
    );
  }

  Future<ApiResponse> postJson(
    String path, {
    Map<String, String>? query,
    Object? body,
    bool authenticated = true,
  }) {
    return _requestJson(
      method: 'POST',
      path: path,
      query: query,
      body: body,
      authenticated: authenticated,
    );
  }

  Future<ApiResponse> _requestJson({
    required String method,
    required String path,
    Map<String, String>? query,
    Object? body,
    required bool authenticated,
  }) async {
    final uri = _buildUri(path, query);
    final request = http.Request(method, uri);

    final headers = <String, String>{
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    if (authenticated) {
      final token = await tokenStore.readToken();
      if (token != null && token.isNotEmpty) {
        headers['Authorization'] = 'Bearer $token';
      }
    }

    request.headers.addAll(headers);
    if (body != null) {
      request.body = jsonEncode(body);
    }

    final streamedResponse = await _httpClient.send(request);
    final response = await http.Response.fromStream(streamedResponse);
    final payload = _decodeJson(response.body);

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return ApiResponse(
        statusCode: response.statusCode,
        data: payload,
      );
    }

    final message = _resolveErrorMessage(
      payload: payload,
      fallback: 'Request failed with status ${response.statusCode}.',
    );

    if (response.statusCode == 401) {
      throw UnauthorizedException(message: message);
    }

    throw ApiException(
      statusCode: response.statusCode,
      message: message,
    );
  }

  Uri _buildUri(String path, Map<String, String>? query) {
    final baseUri = Uri.parse(baseUrl);
    final normalizedPath = path.startsWith('/') ? path : '/$path';
    final mergedPath = _joinPath(baseUri.path, normalizedPath);
    return baseUri.replace(
      path: mergedPath,
      queryParameters: query == null || query.isEmpty ? null : query,
    );
  }

  String _joinPath(String basePath, String extraPath) {
    final safeBase = basePath.endsWith('/')
        ? basePath.substring(0, basePath.length - 1)
        : basePath;
    return '$safeBase$extraPath';
  }

  Map<String, dynamic> _decodeJson(String rawBody) {
    if (rawBody.trim().isEmpty) {
      return <String, dynamic>{};
    }
    try {
      final decoded = jsonDecode(rawBody);
      if (decoded is Map<String, dynamic>) {
        return decoded;
      }
      return <String, dynamic>{
        'data': decoded,
      };
    } catch (_) {
      return <String, dynamic>{
        'message': rawBody,
      };
    }
  }

  String _resolveErrorMessage({
    required Map<String, dynamic> payload,
    required String fallback,
  }) {
    final message = payload['message'];
    if (message is String && message.trim().isNotEmpty) {
      return message.trim();
    }
    return fallback;
  }
}
