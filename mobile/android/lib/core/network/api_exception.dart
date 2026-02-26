class ApiException implements Exception {
  ApiException({required this.message, required this.statusCode});

  final String message;
  final int statusCode;

  @override
  String toString() =>
      'ApiException(statusCode: $statusCode, message: $message)';
}

class UnauthorizedException extends ApiException {
  UnauthorizedException({required super.message}) : super(statusCode: 401);
}

class NetworkException extends ApiException {
  NetworkException({required super.message}) : super(statusCode: 0);
}
