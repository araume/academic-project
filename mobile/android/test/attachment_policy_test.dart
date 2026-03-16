import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:thesis_lite_mobile/features/chat/data/attachment_policy.dart';

void main() {
  test('accepts a valid JPEG attachment', () {
    final bytes = Uint8List.fromList(<int>[
      0xFF,
      0xD8,
      0xFF,
      0xE0,
      0x00,
      0x10,
      0x4A,
      0x46,
      0x49,
      0x46,
    ]);

    final result = AttachmentPolicy.validate(
      bytes: bytes,
      filename: 'photo.jpg',
      providedMimeType: 'image/jpeg',
    );

    expect(result.isValid, isTrue);
    expect(result.mimeType, 'image/jpeg');
  });

  test('rejects unsupported extension', () {
    final result = AttachmentPolicy.validate(
      bytes: Uint8List.fromList(<int>[1, 2, 3]),
      filename: 'payload.exe',
      providedMimeType: 'application/octet-stream',
    );

    expect(result.isValid, isFalse);
    expect(result.errorMessage, contains('Unsupported attachment type'));
  });

  test('rejects oversized file', () {
    final result = AttachmentPolicy.validate(
      bytes: Uint8List(AttachmentPolicy.maxAttachmentBytes + 1),
      filename: 'movie.mp4',
      providedMimeType: 'video/mp4',
    );

    expect(result.isValid, isFalse);
    expect(result.errorMessage, contains('25MB'));
  });
}
