class AuthSession {
  AuthSession({
    required this.uid,
    required this.email,
    required this.displayName,
    required this.course,
  });

  final String uid;
  final String email;
  final String displayName;
  final String course;

  factory AuthSession.fromUserJson(Map<String, dynamic> json) {
    return AuthSession(
      uid: (json['uid'] as String? ?? '').trim(),
      email: (json['email'] as String? ?? '').trim(),
      displayName: ((json['displayName'] as String?) ??
              (json['username'] as String?) ??
              '')
          .trim(),
      course: (json['course'] as String? ?? '').trim(),
    );
  }
}
