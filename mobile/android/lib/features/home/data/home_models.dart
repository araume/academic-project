class FeedPost {
  FeedPost({
    required this.id,
    required this.title,
    required this.content,
    required this.uploaderName,
    required this.uploaderPhotoLink,
    required this.likesCount,
    required this.commentsCount,
    required this.liked,
    required this.isOwner,
    required this.uploadDate,
  });

  final String id;
  final String title;
  final String content;
  final String uploaderName;
  final String? uploaderPhotoLink;
  final int likesCount;
  final int commentsCount;
  final bool liked;
  final bool isOwner;
  final DateTime? uploadDate;

  FeedPost copyWith({int? likesCount, int? commentsCount, bool? liked}) {
    return FeedPost(
      id: id,
      title: title,
      content: content,
      uploaderName: uploaderName,
      uploaderPhotoLink: uploaderPhotoLink,
      likesCount: likesCount ?? this.likesCount,
      commentsCount: commentsCount ?? this.commentsCount,
      liked: liked ?? this.liked,
      isOwner: isOwner,
      uploadDate: uploadDate,
    );
  }

  factory FeedPost.fromJson(Map<String, dynamic> json) {
    final uploader = (json['uploader'] as Map<String, dynamic>?) ??
        const <String, dynamic>{};

    return FeedPost(
      id: (json['id'] as String? ?? '').trim(),
      title: (json['title'] as String? ?? '').trim(),
      content: (json['content'] as String? ?? '').trim(),
      uploaderName: (uploader['displayName'] as String? ?? 'Member').trim(),
      uploaderPhotoLink: uploader['photoLink'] as String?,
      likesCount: (json['likesCount'] as num? ?? 0).toInt(),
      commentsCount: (json['commentsCount'] as num? ?? 0).toInt(),
      liked: json['liked'] == true,
      isOwner: json['isOwner'] == true,
      uploadDate: _parseDate(json['uploadDate']),
    );
  }
}

class PostComment {
  PostComment({
    required this.id,
    required this.displayName,
    required this.content,
    required this.createdAt,
  });

  final String id;
  final String displayName;
  final String content;
  final DateTime? createdAt;

  factory PostComment.fromJson(Map<String, dynamic> json) {
    return PostComment(
      id: (json['_id'] as String? ?? json['id'] as String? ?? '').trim(),
      displayName: (json['displayName'] as String? ?? 'Member').trim(),
      content: (json['content'] as String? ?? '').trim(),
      createdAt: _parseDate(json['createdAt']),
    );
  }
}

DateTime? _parseDate(Object? value) {
  final text = value is String ? value.trim() : '';
  if (text.isEmpty) return null;
  return DateTime.tryParse(text);
}
