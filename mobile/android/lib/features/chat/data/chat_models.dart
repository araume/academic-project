class ChatConversation {
  ChatConversation({
    required this.id,
    required this.title,
    required this.threadType,
    required this.lastMessage,
    required this.lastMessageAt,
    this.unreadCount = 0,
    this.isRead = true,
    this.isArchived = false,
    this.isMuted = false,
    this.canLeave = false,
  });

  final int id;
  final String title;
  final String threadType;
  final String lastMessage;
  final DateTime? lastMessageAt;
  final int unreadCount;
  final bool isRead;
  final bool isArchived;
  final bool isMuted;
  final bool canLeave;

  factory ChatConversation.fromJson(Map<String, dynamic> json) {
    final rawLastMessage = json['lastMessage'];
    final lastMessage = rawLastMessage is Map<String, dynamic>
        ? rawLastMessage
        : null;
    final unreadCount = (json['unreadCount'] as num? ?? 0).toInt();
    final isRead = json['isRead'] is bool
        ? json['isRead'] as bool
        : unreadCount <= 0;

    return ChatConversation(
      id: (json['id'] as num? ?? 0).toInt(),
      title: (json['title'] as String? ?? 'Conversation').trim(),
      threadType: (json['threadType'] as String? ?? '').trim(),
      lastMessage: (lastMessage?['body'] as String? ?? '').trim(),
      lastMessageAt: _parseDate(lastMessage?['createdAt']),
      unreadCount: unreadCount,
      isRead: isRead,
      isArchived: json['isArchived'] == true,
      isMuted: json['isMuted'] == true,
      canLeave: json['canLeave'] == true,
    );
  }
}

class ChatSearchUser {
  ChatSearchUser({
    required this.uid,
    required this.displayName,
    this.course,
    this.bio,
  });

  final String uid;
  final String displayName;
  final String? course;
  final String? bio;

  factory ChatSearchUser.fromJson(Map<String, dynamic> json) {
    return ChatSearchUser(
      uid: (json['uid'] as String? ?? '').trim(),
      displayName: (json['displayName'] as String? ?? 'Member').trim(),
      course: (json['course'] as String?)?.trim(),
      bio: (json['bio'] as String?)?.trim(),
    );
  }
}

class ChatStartConversationResult {
  ChatStartConversationResult({
    required this.state,
    required this.requiresApproval,
    this.threadId,
    this.requestId,
  });

  final String state;
  final bool requiresApproval;
  final int? threadId;
  final int? requestId;

  bool get hasThread => (threadId ?? 0) > 0;

  factory ChatStartConversationResult.fromJson(Map<String, dynamic> json) {
    final rawThreadId = (json['threadId'] as num?)?.toInt();
    final rawRequestId = (json['requestId'] as num?)?.toInt();
    return ChatStartConversationResult(
      state: (json['state'] as String? ?? '').trim(),
      requiresApproval: json['requiresApproval'] == true,
      threadId: (rawThreadId != null && rawThreadId > 0) ? rawThreadId : null,
      requestId:
          (rawRequestId != null && rawRequestId > 0) ? rawRequestId : null,
    );
  }
}

class ChatMessage {
  ChatMessage({
    required this.id,
    required this.senderUid,
    required this.senderName,
    required this.body,
    required this.createdAt,
    required this.attachment,
    required this.replyTo,
  });

  final int id;
  final String senderUid;
  final String senderName;
  final String body;
  final DateTime? createdAt;
  final ChatAttachment? attachment;
  final ChatReplyTo? replyTo;

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    final attachment = json['attachment'] as Map<String, dynamic>?;
    final replyTo = json['replyTo'] as Map<String, dynamic>?;
    return ChatMessage(
      id: (json['id'] as num? ?? 0).toInt(),
      senderUid: (json['senderUid'] as String? ?? '').trim(),
      senderName: (json['senderName'] as String? ?? 'Member').trim(),
      body: (json['body'] as String? ?? '').trim(),
      createdAt: _parseDate(json['createdAt']),
      attachment:
          attachment == null ? null : ChatAttachment.fromJson(attachment),
      replyTo: replyTo == null ? null : ChatReplyTo.fromJson(replyTo),
    );
  }

  String get bodyOrAttachmentLabel {
    if (body.isNotEmpty) {
      return body;
    }
    final attachmentType = attachment?.type;
    if (attachmentType == null || attachmentType.isEmpty) {
      return '';
    }
    return attachmentType == 'video'
        ? '[Video attachment]'
        : '[Image attachment]';
  }
}

class ChatAttachment {
  ChatAttachment({
    required this.type,
    required this.link,
    required this.filename,
    required this.mimeType,
    required this.sizeBytes,
  });

  final String type;
  final String? link;
  final String? filename;
  final String? mimeType;
  final int? sizeBytes;

  factory ChatAttachment.fromJson(Map<String, dynamic> json) {
    return ChatAttachment(
      type: (json['type'] as String? ?? '').trim(),
      link: (json['link'] as String?)?.trim(),
      filename: (json['filename'] as String?)?.trim(),
      mimeType: (json['mimeType'] as String?)?.trim(),
      sizeBytes: (json['sizeBytes'] as num?)?.toInt(),
    );
  }
}

class ChatReplyTo {
  ChatReplyTo({
    required this.id,
    required this.senderUid,
    required this.senderName,
    required this.bodySnippet,
  });

  final int id;
  final String? senderUid;
  final String senderName;
  final String bodySnippet;

  factory ChatReplyTo.fromJson(Map<String, dynamic> json) {
    return ChatReplyTo(
      id: (json['id'] as num? ?? 0).toInt(),
      senderUid: (json['senderUid'] as String?)?.trim(),
      senderName: (json['senderName'] as String? ?? 'Member').trim(),
      bodySnippet: (json['bodySnippet'] as String? ?? '').trim(),
    );
  }
}

class ChatTypingUser {
  ChatTypingUser({
    required this.uid,
    required this.displayName,
    required this.updatedAt,
  });

  final String uid;
  final String displayName;
  final DateTime? updatedAt;

  factory ChatTypingUser.fromJson(Map<String, dynamic> json) {
    return ChatTypingUser(
      uid: (json['uid'] as String? ?? '').trim(),
      displayName: (json['displayName'] as String? ?? 'Member').trim(),
      updatedAt: _parseDate(json['updatedAt']),
    );
  }
}

DateTime? _parseDate(Object? value) {
  final text = value is String ? value.trim() : '';
  if (text.isEmpty) return null;
  return DateTime.tryParse(text);
}
