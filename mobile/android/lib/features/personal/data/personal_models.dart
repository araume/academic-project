class PersonalFolder {
  PersonalFolder({
    required this.id,
    required this.name,
  });

  final String id;
  final String name;

  factory PersonalFolder.fromJson(Map<String, dynamic> json) {
    return PersonalFolder(
      id: _readId(json['_id']),
      name: (json['name'] as String? ?? '').trim(),
    );
  }
}

class PersonalJournal {
  PersonalJournal({
    required this.id,
    required this.title,
    required this.content,
    required this.folder,
    required this.tags,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String title;
  final String content;
  final String? folder;
  final List<String> tags;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  factory PersonalJournal.fromJson(Map<String, dynamic> json) {
    return PersonalJournal(
      id: _readId(json['_id']),
      title: (json['title'] as String? ?? '').trim(),
      content: (json['content'] as String? ?? '').trim(),
      folder: (json['folder'] as String?)?.trim(),
      tags: _readStringList(json['tags']),
      createdAt: _parseDate(json['createdAt']),
      updatedAt: _parseDate(json['updatedAt']),
    );
  }
}

class PersonalTask {
  PersonalTask({
    required this.id,
    required this.title,
    required this.description,
    required this.status,
    required this.priority,
    required this.dueDate,
    required this.tags,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String title;
  final String description;
  final String status;
  final String priority;
  final String? dueDate;
  final List<String> tags;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  PersonalTask copyWith({
    String? status,
  }) {
    return PersonalTask(
      id: id,
      title: title,
      description: description,
      status: status ?? this.status,
      priority: priority,
      dueDate: dueDate,
      tags: tags,
      createdAt: createdAt,
      updatedAt: updatedAt,
    );
  }

  factory PersonalTask.fromJson(Map<String, dynamic> json) {
    return PersonalTask(
      id: _readId(json['_id']),
      title: (json['title'] as String? ?? '').trim(),
      description: (json['description'] as String? ?? '').trim(),
      status: (json['status'] as String? ?? 'pending').trim(),
      priority: (json['priority'] as String? ?? 'normal').trim(),
      dueDate: (json['dueDate'] as String?)?.trim(),
      tags: _readStringList(json['tags']),
      createdAt: _parseDate(json['createdAt']),
      updatedAt: _parseDate(json['updatedAt']),
    );
  }
}

class PersonalConversation {
  PersonalConversation({
    required this.id,
    required this.title,
    required this.updatedAt,
  });

  final String id;
  final String title;
  final DateTime? updatedAt;

  factory PersonalConversation.fromJson(Map<String, dynamic> json) {
    return PersonalConversation(
      id: _readId(json['_id']),
      title: (json['title'] as String? ?? 'New conversation').trim(),
      updatedAt: _parseDate(json['updatedAt']),
    );
  }
}

class PersonalMessage {
  PersonalMessage({
    required this.id,
    required this.role,
    required this.content,
    required this.createdAt,
  });

  final String id;
  final String role;
  final String content;
  final DateTime? createdAt;

  factory PersonalMessage.fromJson(Map<String, dynamic> json) {
    return PersonalMessage(
      id: _readId(json['_id']),
      role: (json['role'] as String? ?? '').trim(),
      content: (json['content'] as String? ?? '').trim(),
      createdAt: _parseDate(json['createdAt']),
    );
  }
}

class PersonalSendMessageResult {
  PersonalSendMessageResult({
    required this.message,
    required this.proposalId,
    required this.proposedTasksCount,
  });

  final PersonalMessage? message;
  final String? proposalId;
  final int proposedTasksCount;
}

class ProfileData {
  ProfileData({
    required this.uid,
    required this.displayName,
    required this.bio,
    required this.mainCourse,
    required this.subCourses,
    required this.facebook,
    required this.linkedin,
    required this.instagram,
    required this.github,
    required this.portfolio,
    required this.photoLink,
  });

  final String uid;
  final String displayName;
  final String bio;
  final String? mainCourse;
  final List<String> subCourses;
  final String facebook;
  final String linkedin;
  final String instagram;
  final String github;
  final String portfolio;
  final String? photoLink;

  factory ProfileData.fromJson(Map<String, dynamic> json) {
    return ProfileData(
      uid: (json['uid'] as String? ?? '').trim(),
      displayName: (json['display_name'] as String? ?? '').trim(),
      bio: (json['bio'] as String? ?? '').trim(),
      mainCourse: (json['main_course'] as String?)?.trim(),
      subCourses: _readStringList(json['sub_courses']),
      facebook: (json['facebook'] as String? ?? '').trim(),
      linkedin: (json['linkedin'] as String? ?? '').trim(),
      instagram: (json['instagram'] as String? ?? '').trim(),
      github: (json['github'] as String? ?? '').trim(),
      portfolio: (json['portfolio'] as String? ?? '').trim(),
      photoLink: (json['photo_link'] as String?)?.trim(),
    );
  }
}

class PersonRelation {
  PersonRelation({
    required this.isFollowing,
    required this.followsYou,
    required this.followRequestSent,
    required this.followRequestReceived,
  });

  final bool isFollowing;
  final bool followsYou;
  final bool followRequestSent;
  final bool followRequestReceived;

  PersonRelation copyWith({
    bool? isFollowing,
    bool? followsYou,
    bool? followRequestSent,
    bool? followRequestReceived,
  }) {
    return PersonRelation(
      isFollowing: isFollowing ?? this.isFollowing,
      followsYou: followsYou ?? this.followsYou,
      followRequestSent: followRequestSent ?? this.followRequestSent,
      followRequestReceived: followRequestReceived ?? this.followRequestReceived,
    );
  }

  factory PersonRelation.fromJson(Map<String, dynamic> json) {
    return PersonRelation(
      isFollowing: json['isFollowing'] == true,
      followsYou: json['followsYou'] == true,
      followRequestSent: json['followRequestSent'] == true,
      followRequestReceived: json['followRequestReceived'] == true,
    );
  }
}

class PersonSearchUser {
  PersonSearchUser({
    required this.uid,
    required this.displayName,
    required this.course,
    required this.bio,
    required this.photoLink,
    required this.relation,
  });

  final String uid;
  final String displayName;
  final String? course;
  final String? bio;
  final String? photoLink;
  final PersonRelation relation;

  PersonSearchUser copyWith({
    PersonRelation? relation,
  }) {
    return PersonSearchUser(
      uid: uid,
      displayName: displayName,
      course: course,
      bio: bio,
      photoLink: photoLink,
      relation: relation ?? this.relation,
    );
  }

  factory PersonSearchUser.fromJson(Map<String, dynamic> json) {
    return PersonSearchUser(
      uid: (json['uid'] as String? ?? '').trim(),
      displayName: (json['displayName'] as String? ?? 'Member').trim(),
      course: (json['course'] as String?)?.trim(),
      bio: (json['bio'] as String?)?.trim(),
      photoLink: (json['photoLink'] as String?)?.trim(),
      relation: PersonRelation.fromJson(
        (json['relation'] as Map<String, dynamic>?) ?? <String, dynamic>{},
      ),
    );
  }
}

String _readId(Object? raw) {
  if (raw == null) return '';
  if (raw is String) return raw.trim();
  if (raw is Map<String, dynamic>) {
    final oid = raw[r'$oid'];
    if (oid is String) return oid.trim();
  }
  return raw.toString().trim();
}

List<String> _readStringList(Object? raw) {
  if (raw is! List) return <String>[];
  return raw.map((item) => item.toString().trim()).where((v) => v.isNotEmpty).toList();
}

DateTime? _parseDate(Object? raw) {
  final text = raw is String ? raw.trim() : '';
  if (text.isEmpty) return null;
  return DateTime.tryParse(text);
}
