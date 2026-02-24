class LibraryDocument {
  LibraryDocument({
    required this.uuid,
    required this.title,
    required this.description,
    required this.course,
    required this.subject,
    required this.uploaderName,
    required this.views,
    required this.popularity,
    required this.liked,
    required this.isOwner,
    required this.link,
    required this.thumbnailLink,
    required this.uploadDate,
  });

  final String uuid;
  final String title;
  final String description;
  final String course;
  final String subject;
  final String uploaderName;
  final int views;
  final int popularity;
  final bool liked;
  final bool isOwner;
  final String? link;
  final String? thumbnailLink;
  final DateTime? uploadDate;

  LibraryDocument copyWith({int? popularity, bool? liked, int? views}) {
    return LibraryDocument(
      uuid: uuid,
      title: title,
      description: description,
      course: course,
      subject: subject,
      uploaderName: uploaderName,
      views: views ?? this.views,
      popularity: popularity ?? this.popularity,
      liked: liked ?? this.liked,
      isOwner: isOwner,
      link: link,
      thumbnailLink: thumbnailLink,
      uploadDate: uploadDate,
    );
  }

  factory LibraryDocument.fromJson(Map<String, dynamic> json) {
    return LibraryDocument(
      uuid: (json['uuid'] as String? ?? '').trim(),
      title: (json['title'] as String? ?? '').trim(),
      description: (json['description'] as String? ?? '').trim(),
      course: (json['course'] as String? ?? '').trim(),
      subject: (json['subject'] as String? ?? '').trim(),
      uploaderName: (json['uploader_name'] as String? ?? 'Member').trim(),
      views: (json['views'] as num? ?? 0).toInt(),
      popularity: (json['popularity'] as num? ?? 0).toInt(),
      liked: json['liked'] == true,
      isOwner: json['is_owner'] == true,
      link: (json['link'] as String?)?.trim(),
      thumbnailLink: (json['thumbnail_link'] as String?)?.trim(),
      uploadDate: _parseDate(json['uploaddate']),
    );
  }
}

class LibraryComment {
  LibraryComment({
    required this.id,
    required this.displayName,
    required this.content,
    required this.createdAt,
  });

  final String id;
  final String displayName;
  final String content;
  final DateTime? createdAt;

  factory LibraryComment.fromJson(Map<String, dynamic> json) {
    return LibraryComment(
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
