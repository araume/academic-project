import 'dart:typed_data';

import 'package:mime/mime.dart';

class AttachmentPolicy {
  static const int maxAttachmentBytes = 25 * 1024 * 1024;

  static const List<String> allowedExtensions = <String>[
    'jpg',
    'jpeg',
    'png',
    'webp',
    'heic',
    'heif',
    'mp4',
    'mov',
    'webm',
    'mkv',
  ];

  static const Set<String> _allowedExtensionSet = <String>{
    'jpg',
    'jpeg',
    'png',
    'webp',
    'heic',
    'heif',
    'mp4',
    'mov',
    'webm',
    'mkv',
  };

  static const Set<String> _allowedMimeTypes = <String>{
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-matroska',
  };

  static AttachmentValidationResult validate({
    required Uint8List bytes,
    required String filename,
    String? providedMimeType,
  }) {
    if (bytes.isEmpty) {
      return const AttachmentValidationResult.invalid(
        'Failed to read selected file.',
      );
    }

    if (bytes.length > maxAttachmentBytes) {
      return const AttachmentValidationResult.invalid(
        'Attachment exceeds 25MB limit.',
      );
    }

    final safeName = filename.trim();
    final extension = _extensionOf(safeName);
    if (extension == null || !_allowedExtensionSet.contains(extension)) {
      return const AttachmentValidationResult.invalid(
        'Unsupported attachment type. Use image/video files only.',
      );
    }

    final resolvedMimeType = _resolveMimeType(
      filename: safeName,
      bytes: bytes,
      providedMimeType: providedMimeType,
    );

    if (resolvedMimeType == null || !_allowedMimeTypes.contains(resolvedMimeType)) {
      return const AttachmentValidationResult.invalid(
        'Unsupported attachment MIME type.',
      );
    }

    return AttachmentValidationResult.valid(resolvedMimeType);
  }

  static String? _resolveMimeType({
    required String filename,
    required Uint8List bytes,
    String? providedMimeType,
  }) {
    final normalizedProvided = _normalizeMimeType(providedMimeType);
    if (normalizedProvided != null) {
      return normalizedProvided;
    }
    final detected = lookupMimeType(filename, headerBytes: bytes.take(16).toList());
    return _normalizeMimeType(detected);
  }

  static String? _normalizeMimeType(String? value) {
    final raw = value?.trim().toLowerCase();
    if (raw == null || raw.isEmpty) return null;
    final semicolonIndex = raw.indexOf(';');
    return semicolonIndex >= 0 ? raw.substring(0, semicolonIndex) : raw;
  }

  static String? _extensionOf(String value) {
    final dot = value.lastIndexOf('.');
    if (dot < 0 || dot == value.length - 1) return null;
    return value.substring(dot + 1).trim().toLowerCase();
  }
}

class AttachmentValidationResult {
  const AttachmentValidationResult._({
    required this.isValid,
    this.errorMessage,
    this.mimeType,
  });

  const AttachmentValidationResult.valid(String mimeType)
      : this._(isValid: true, mimeType: mimeType);

  const AttachmentValidationResult.invalid(String message)
      : this._(isValid: false, errorMessage: message);

  final bool isValid;
  final String? errorMessage;
  final String? mimeType;
}
