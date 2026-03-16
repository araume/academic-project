import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:thesis_lite_mobile/core/network/api_client.dart';
import 'package:thesis_lite_mobile/core/storage/token_store.dart';
import 'package:thesis_lite_mobile/features/chat/data/chat_models.dart';
import 'package:thesis_lite_mobile/features/chat/data/chat_repository.dart';
import 'package:thesis_lite_mobile/features/chat/presentation/chat_conversation_screen.dart';

void main() {
  testWidgets('reply flow sets reply target and sends with reply id', (
    tester,
  ) async {
    final repository = _FakeChatRepository();

    await tester.pumpWidget(
      _buildTestApp(
        repository: repository,
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Hello world'), findsOneWidget);

    await tester.longPress(find.text('Hello world'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Reply'));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('chat_reply_preview')), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'Replying now');
    await tester.tap(find.byKey(const Key('chat_send_button')));
    await tester.pumpAndSettle();

    expect(repository.sentBodies.last, 'Replying now');
    expect(repository.lastSentReplyId, 11);
    expect(find.byKey(const Key('chat_reply_preview')), findsNothing);
  });

  testWidgets('report action sends message report', (tester) async {
    final repository = _FakeChatRepository();

    await tester.pumpWidget(
      _buildTestApp(
        repository: repository,
      ),
    );
    await tester.pumpAndSettle();

    await tester.longPress(find.text('Hello world'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Report message'));
    await tester.pumpAndSettle();

    expect(find.text('Report message'), findsWidgets);

    await tester.enterText(
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.byType(TextField),
      ),
      'abuse',
    );
    await tester.tap(find.text('Report'));
    await tester.pumpAndSettle();

    expect(repository.reportedMessageIds, <int>[11]);
    expect(repository.reportReasons, <String>['abuse']);
    expect(find.text('Message reported.'), findsOneWidget);
  });

  testWidgets('emoji bar and picked attachment preview are shown',
      (tester) async {
    final repository = _FakeChatRepository();

    await tester.pumpWidget(
      _buildTestApp(
        repository: repository,
        attachmentPicker: () async => PickedAttachment(
          name: 'photo.jpg',
          bytes: Uint8List.fromList(<int>[1, 2, 3]),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('chat_emoji_toggle')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('chat_emoji_bar')), findsOneWidget);

    await tester.tap(find.text('😀'));
    await tester.pumpAndSettle();

    final textField = tester.widget<TextField>(find.byType(TextField));
    expect(textField.controller!.text, contains('😀'));

    await tester.tap(find.byKey(const Key('chat_attach_button')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('chat_pending_attachment_preview')),
        findsOneWidget);
    expect(find.textContaining('photo.jpg'), findsOneWidget);
  });
}

Widget _buildTestApp({
  required _FakeChatRepository repository,
  Future<PickedAttachment?> Function()? attachmentPicker,
}) {
  return MaterialApp(
    home: ChatConversationScreen(
      repository: repository,
      currentUid: 'me',
      conversation: ChatConversation(
        id: 1,
        title: 'Test Conversation',
        threadType: 'direct',
        lastMessage: 'Hello world',
        lastMessageAt: DateTime.now(),
      ),
      attachmentPicker: attachmentPicker,
    ),
  );
}

class _FakeChatRepository extends ChatRepository {
  _FakeChatRepository()
      : super(
          apiClient: ApiClient(
            baseUrl: 'http://localhost',
            tokenStore: _NoopTokenStore(),
          ),
        );

  final List<String> sentBodies = <String>[];
  final List<int> reportedMessageIds = <int>[];
  final List<String> reportReasons = <String>[];
  int? lastSentReplyId;

  @override
  Future<List<ChatMessage>> fetchMessages(
    int conversationId, {
    int page = 1,
    int pageSize = 80,
  }) async {
    return <ChatMessage>[
      ChatMessage(
        id: 11,
        senderUid: 'other',
        senderName: 'Other User',
        body: 'Hello world',
        createdAt: DateTime.now(),
        attachment: null,
        replyTo: null,
      ),
    ];
  }

  @override
  Future<List<ChatTypingUser>> fetchTypingUsers(int conversationId) async {
    return <ChatTypingUser>[];
  }

  @override
  Future<void> updateTyping({
    required int conversationId,
    required bool isTyping,
  }) async {}

  @override
  Future<ChatMessage> sendTextMessage({
    required int conversationId,
    required String body,
    int? replyToMessageId,
    List<int>? attachmentBytes,
    String? attachmentFilename,
    String? attachmentMimeType,
  }) async {
    sentBodies.add(body);
    lastSentReplyId = replyToMessageId;
    return ChatMessage(
      id: 99,
      senderUid: 'me',
      senderName: 'Me',
      body: body,
      createdAt: DateTime.now(),
      attachment: null,
      replyTo: null,
    );
  }

  @override
  Future<void> reportMessage({
    required int messageId,
    String reason = '',
  }) async {
    reportedMessageIds.add(messageId);
    reportReasons.add(reason);
  }
}

class _NoopTokenStore extends TokenStore {
  _NoopTokenStore() : super(storage: const FlutterSecureStorage());

  @override
  Future<void> clear() async {}

  @override
  Future<String?> readToken() async => null;

  @override
  Future<void> writeToken(String token) async {}
}
