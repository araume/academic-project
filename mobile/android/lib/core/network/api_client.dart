import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import '../storage/token_store.dart';
import 'api_exception.dart';

class ApiResponse {
  ApiResponse({required this.statusCode, required this.data});

  final int statusCode;
  final Map<String, dynamic> data;
}

class MultipartFileData {
  MultipartFileData({
    required this.field,
    required this.filename,
    required this.bytes,
    this.mimeType,
  });

  final String field;
  final String filename;
  final List<int> bytes;
  final String? mimeType;
}

class ApiClient {
  ApiClient({
    required this.baseUrl,
    required this.tokenStore,
    http.Client? httpClient,
    Duration requestTimeout = const Duration(seconds: 15),
    int maxGetRetries = 2,
    Duration retryBaseDelay = const Duration(milliseconds: 250),
  })  : _httpClient = httpClient ?? http.Client(),
        _requestTimeout = requestTimeout,
        _maxGetRetries = maxGetRetries,
        _retryBaseDelay = retryBaseDelay;

  final String baseUrl;
  final TokenStore tokenStore;
  final http.Client _httpClient;
  final Duration _requestTimeout;
  final int _maxGetRetries;
  final Duration _retryBaseDelay;

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

  Future<ApiResponse> postMultipart(
    String path, {
    Map<String, String>? fields,
    List<MultipartFileData> files = const <MultipartFileData>[],
    bool authenticated = true,
  }) async {
    try {
      final uri = _buildUri(path, null);
      final request = http.MultipartRequest('POST', uri);
      request.headers.addAll(
        await _buildHeaders(
          authenticated: authenticated,
          includeJsonContentType: false,
        ),
      );

      if (fields != null && fields.isNotEmpty) {
        request.fields.addAll(fields);
      }

      for (final file in files) {
        final normalizedMimeType = file.mimeType?.trim();
        final parsedMediaType = (normalizedMimeType == null ||
                normalizedMimeType.isEmpty)
            ? null
            : _parseMediaType(normalizedMimeType);

        request.files.add(
          http.MultipartFile.fromBytes(
            file.field,
            file.bytes,
            filename: file.filename,
            contentType: parsedMediaType,
          ),
        );
      }

      final streamedResponse =
          await _httpClient.send(request).timeout(_requestTimeout);
      final response = await http.Response.fromStream(streamedResponse)
          .timeout(_requestTimeout);
      return _handleResponse(response);
    } on TimeoutException {
      throw NetworkException(
          message: 'Request timed out. Check your connection and retry.');
    } on SocketException {
      throw NetworkException(
        message: 'Cannot reach server. Check internet and API base URL.',
      );
    } on http.ClientException catch (error) {
      throw NetworkException(message: error.message);
    }
  }

  Future<ApiResponse> _requestJson({
    required String method,
    required String path,
    Map<String, String>? query,
    Object? body,
    required bool authenticated,
  }) async {
    final uri = _buildUri(path, query);
    final headers = await _buildHeaders(authenticated: authenticated);
    final attemptLimit = method.toUpperCase() == 'GET' ? _maxGetRetries + 1 : 1;

    for (var attempt = 1; attempt <= attemptLimit; attempt++) {
      final request = http.Request(method, uri);
      request.headers.addAll(headers);
      if (body != null) {
        request.body = jsonEncode(body);
      }

      try {
        final streamedResponse =
            await _httpClient.send(request).timeout(_requestTimeout);
        final response = await http.Response.fromStream(streamedResponse)
            .timeout(_requestTimeout);

        if (_shouldRetryStatus(response.statusCode) && attempt < attemptLimit) {
          await _retryBackoff(attempt);
          continue;
        }

        return _handleResponse(response);
      } on TimeoutException {
        if (attempt < attemptLimit) {
          await _retryBackoff(attempt);
          continue;
        }
        throw NetworkException(
            message: 'Request timed out. Check your connection and retry.');
      } on SocketException {
        if (attempt < attemptLimit) {
          await _retryBackoff(attempt);
          continue;
        }
        throw NetworkException(
          message: 'Cannot reach server. Check internet and API base URL.',
        );
      } on http.ClientException catch (error) {
        if (attempt < attemptLimit) {
          await _retryBackoff(attempt);
          continue;
        }
        throw NetworkException(message: error.message);
      }
    }

    throw NetworkException(message: 'Request failed. Please retry.');
  }

  Future<Map<String, String>> _buildHeaders({
    required bool authenticated,
    bool includeJsonContentType = true,
  }) async {
    final headers = <String, String>{'Accept': 'application/json'};
    if (includeJsonContentType) {
      headers['Content-Type'] = 'application/json';
    }

    if (authenticated) {
      final token = await tokenStore.readToken();
      if (token != null && token.isNotEmpty) {
        headers['Authorization'] = 'Bearer $token';
      }
    }
    return headers;
  }

  ApiResponse _handleResponse(http.Response response) {
    final payload = _decodeJson(response.body);
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return ApiResponse(statusCode: response.statusCode, data: payload);
    }

    final message = _resolveErrorMessage(
      payload: payload,
      fallback: 'Request failed with status ${response.statusCode}.',
    );

    if (response.statusCode == 401) {
      throw UnauthorizedException(message: message);
    }

    throw ApiException(statusCode: response.statusCode, message: message);
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
      return <String, dynamic>{'data': decoded};
    } catch (_) {
      return <String, dynamic>{'message': rawBody};
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

  bool _shouldRetryStatus(int statusCode) {
    return statusCode == 408 || statusCode == 429 || statusCode >= 500;
  }

  Future<void> _retryBackoff(int attempt) async {
    if (_retryBaseDelay == Duration.zero) return;
    final factor = attempt <= 1 ? 1 : (attempt * attempt);
    final wait = _retryBaseDelay * factor;
    await Future<void>.delayed(wait);
  }

  MediaType? _parseMediaType(String value) {
    try {
      return MediaType.parse(value);
    } catch (_) {
      return null;
    }
  }
}
