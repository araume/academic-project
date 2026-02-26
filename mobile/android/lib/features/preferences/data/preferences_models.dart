enum NonFollowerChatPolicy {
  allow,
  request,
  deny;

  String get wireValue {
    switch (this) {
      case NonFollowerChatPolicy.allow:
        return 'allow';
      case NonFollowerChatPolicy.request:
        return 'request';
      case NonFollowerChatPolicy.deny:
        return 'deny';
    }
  }

  String get label {
    switch (this) {
      case NonFollowerChatPolicy.allow:
        return 'Allow everyone';
      case NonFollowerChatPolicy.request:
        return 'Require request';
      case NonFollowerChatPolicy.deny:
        return 'Deny everyone';
    }
  }

  static NonFollowerChatPolicy fromWire(Object? raw) {
    final text = (raw as String? ?? '').trim().toLowerCase();
    switch (text) {
      case 'allow':
        return NonFollowerChatPolicy.allow;
      case 'deny':
        return NonFollowerChatPolicy.deny;
      default:
        return NonFollowerChatPolicy.request;
    }
  }
}

class PrivacySettings {
  const PrivacySettings({
    required this.searchable,
    required this.followApprovalRequired,
    required this.activeVisible,
    required this.notifyNewPostsFromFollowing,
    required this.notifyPostActivity,
    required this.notifyDocumentActivity,
    required this.nonFollowerChatPolicy,
  });

  final bool searchable;
  final bool followApprovalRequired;
  final bool activeVisible;
  final bool notifyNewPostsFromFollowing;
  final bool notifyPostActivity;
  final bool notifyDocumentActivity;
  final NonFollowerChatPolicy nonFollowerChatPolicy;

  factory PrivacySettings.fromJson(Map<String, dynamic> json) {
    return PrivacySettings(
      searchable: json['searchable'] != false,
      followApprovalRequired: json['follow_approval_required'] != false,
      activeVisible: json['active_visible'] != false,
      notifyNewPostsFromFollowing:
          json['notify_new_posts_from_following'] != false,
      notifyPostActivity: json['notify_post_activity'] != false,
      notifyDocumentActivity: json['notify_document_activity'] != false,
      nonFollowerChatPolicy:
          NonFollowerChatPolicy.fromWire(json['non_follower_chat_policy']),
    );
  }

  Map<String, dynamic> toPatchPayload() {
    return <String, dynamic>{
      'searchable': searchable,
      'follow_approval_required': followApprovalRequired,
      'active_visible': activeVisible,
      'notify_new_posts_from_following': notifyNewPostsFromFollowing,
      'notify_post_activity': notifyPostActivity,
      'notify_document_activity': notifyDocumentActivity,
      'non_follower_chat_policy': nonFollowerChatPolicy.wireValue,
    };
  }

  PrivacySettings copyWith({
    bool? searchable,
    bool? followApprovalRequired,
    bool? activeVisible,
    bool? notifyNewPostsFromFollowing,
    bool? notifyPostActivity,
    bool? notifyDocumentActivity,
    NonFollowerChatPolicy? nonFollowerChatPolicy,
  }) {
    return PrivacySettings(
      searchable: searchable ?? this.searchable,
      followApprovalRequired:
          followApprovalRequired ?? this.followApprovalRequired,
      activeVisible: activeVisible ?? this.activeVisible,
      notifyNewPostsFromFollowing:
          notifyNewPostsFromFollowing ?? this.notifyNewPostsFromFollowing,
      notifyPostActivity: notifyPostActivity ?? this.notifyPostActivity,
      notifyDocumentActivity:
          notifyDocumentActivity ?? this.notifyDocumentActivity,
      nonFollowerChatPolicy:
          nonFollowerChatPolicy ?? this.nonFollowerChatPolicy,
    );
  }
}
