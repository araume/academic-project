import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../library/data/library_models.dart';
import 'personal_models.dart';

class PersonalRepository {
  PersonalRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;

  Future<List<PersonalJournal>> fetchJournals() async {
    final response = await _apiClient.getJson('/api/personal/journals');
    final raw = response.data['entries'];
    if (raw is! List) return <PersonalJournal>[];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(PersonalJournal.fromJson)
        .where((entry) => entry.id.isNotEmpty)
        .toList();
  }

  Future<List<PersonalFolder>> fetchFolders() async {
    final response = await _apiClient.getJson('/api/personal/journal-folders');
    final raw = response.data['folders'];
    if (raw is! List) return <PersonalFolder>[];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(PersonalFolder.fromJson)
        .where((folder) => folder.name.isNotEmpty)
        .toList();
  }

  Future<void> createFolder(String name) async {
    final trimmed = name.trim();
    if (trimmed.isEmpty) {
      throw ApiException(statusCode: 400, message: 'Folder name is required.');
    }
    await _apiClient.postJson(
      '/api/personal/journal-folders',
      body: <String, dynamic>{'name': trimmed},
    );
  }

  Future<void> deleteFolder(String folderId) async {
    if (folderId.trim().isEmpty) return;
    await _apiClient.deleteJson('/api/personal/journal-folders/${folderId.trim()}');
  }

  Future<void> createJournal({
    required String title,
    required String content,
    String? folder,
    String tags = '',
  }) async {
    await _apiClient.postJson(
      '/api/personal/journals',
      body: <String, dynamic>{
        'title': title.trim(),
        'content': content,
        'folder': (folder ?? '').trim().isEmpty ? null : folder!.trim(),
        'tags': tags,
      },
    );
  }

  Future<void> updateJournal({
    required String journalId,
    required String title,
    required String content,
    String? folder,
    String tags = '',
  }) async {
    await _apiClient.patchJson(
      '/api/personal/journals/${journalId.trim()}',
      body: <String, dynamic>{
        'title': title.trim(),
        'content': content,
        'folder': (folder ?? '').trim().isEmpty ? null : folder!.trim(),
        'tags': tags,
      },
    );
  }

  Future<void> deleteJournal(String journalId) async {
    await _apiClient.deleteJson('/api/personal/journals/${journalId.trim()}');
  }

  Future<List<PersonalTask>> fetchTasks() async {
    final response = await _apiClient.getJson('/api/personal/tasks');
    final raw = response.data['tasks'];
    if (raw is! List) return <PersonalTask>[];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(PersonalTask.fromJson)
        .where((task) => task.id.isNotEmpty)
        .toList();
  }

  Future<void> createTask({
    required String title,
    String description = '',
    String priority = 'normal',
    String? dueDate,
    String tags = '',
  }) async {
    await _apiClient.postJson(
      '/api/personal/tasks',
      body: <String, dynamic>{
        'title': title.trim(),
        'description': description.trim(),
        'priority': priority,
        'dueDate': (dueDate ?? '').trim().isEmpty ? null : dueDate,
        'tags': tags,
        'status': 'pending',
      },
    );
  }

  Future<void> updateTaskStatus({
    required String taskId,
    required String status,
  }) async {
    await _apiClient.patchJson(
      '/api/personal/tasks/${taskId.trim()}',
      body: <String, dynamic>{'status': status},
    );
  }

  Future<void> deleteTask(String taskId) async {
    await _apiClient.deleteJson('/api/personal/tasks/${taskId.trim()}');
  }

  Future<List<PersonalConversation>> fetchConversations() async {
    final response = await _apiClient.getJson('/api/personal/conversations');
    final raw = response.data['conversations'];
    if (raw is! List) return <PersonalConversation>[];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(PersonalConversation.fromJson)
        .where((conv) => conv.id.isNotEmpty)
        .toList();
  }

  Future<PersonalConversation> createConversation({
    String title = 'New conversation',
  }) async {
    final response = await _apiClient.postJson(
      '/api/personal/conversations',
      body: <String, dynamic>{'title': title},
    );
    final raw = response.data['conversation'];
    if (raw is! Map<String, dynamic>) {
      throw ApiException(
        statusCode: response.statusCode,
        message: 'Invalid conversation response.',
      );
    }
    return PersonalConversation.fromJson(raw);
  }

  Future<void> deleteConversation(String conversationId) async {
    await _apiClient.deleteJson(
      '/api/personal/conversations/${conversationId.trim()}',
    );
  }

  Future<List<PersonalMessage>> fetchMessages(String conversationId) async {
    final response = await _apiClient.getJson(
      '/api/personal/conversations/${conversationId.trim()}/messages',
    );
    final raw = response.data['messages'];
    if (raw is! List) return <PersonalMessage>[];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(PersonalMessage.fromJson)
        .where((msg) => msg.role.isNotEmpty)
        .toList();
  }

  Future<PersonalSendMessageResult> sendMessage({
    required String conversationId,
    required String content,
    String? contextDocUuid,
  }) async {
    final response = await _apiClient.postJson(
      '/api/personal/conversations/${conversationId.trim()}/messages',
      body: <String, dynamic>{
        'content': content.trim(),
        if ((contextDocUuid ?? '').trim().isNotEmpty)
          'contextDoc': <String, dynamic>{'uuid': contextDocUuid!.trim()},
      },
    );

    final rawMessage = response.data['message'];
    final proposed = response.data['proposedTasks'];
    return PersonalSendMessageResult(
      message: rawMessage is Map<String, dynamic>
          ? PersonalMessage.fromJson(rawMessage)
          : null,
      proposalId: (response.data['proposalId'] as String?)?.trim(),
      proposedTasksCount: proposed is List ? proposed.length : 0,
    );
  }

  Future<void> confirmProposal(String proposalId) async {
    await _apiClient.postJson(
      '/api/personal/task-proposals/${proposalId.trim()}/confirm',
      body: const <String, dynamic>{},
    );
  }

  Future<void> rejectProposal(String proposalId) async {
    await _apiClient.postJson(
      '/api/personal/task-proposals/${proposalId.trim()}/reject',
      body: const <String, dynamic>{},
    );
  }

  Future<ProfileData> fetchMyProfile() async {
    final response = await _apiClient.getJson('/api/profile');
    final raw = response.data['profile'];
    if (raw is! Map<String, dynamic>) {
      throw ApiException(
        statusCode: response.statusCode,
        message: 'Invalid profile response.',
      );
    }
    return ProfileData.fromJson(raw);
  }

  Future<ProfileData> updateProfile({
    required String displayName,
    required String bio,
    String? mainCourse,
    String subCourses = '',
    String facebook = '',
    String linkedin = '',
    String instagram = '',
    String github = '',
    String portfolio = '',
  }) async {
    final response = await _apiClient.patchJson(
      '/api/profile',
      body: <String, dynamic>{
        'display_name': displayName.trim(),
        'bio': bio.trim(),
        'main_course': (mainCourse ?? '').trim().isEmpty ? null : mainCourse,
        'sub_courses': subCourses
            .split(',')
            .map((value) => value.trim())
            .where((value) => value.isNotEmpty)
            .toList(),
        'facebook': facebook.trim(),
        'linkedin': linkedin.trim(),
        'instagram': instagram.trim(),
        'github': github.trim(),
        'portfolio': portfolio.trim(),
      },
    );
    final raw = response.data['profile'];
    if (raw is! Map<String, dynamic>) {
      throw ApiException(
        statusCode: response.statusCode,
        message: 'Invalid profile update response.',
      );
    }
    return ProfileData.fromJson(raw);
  }

  Future<String> uploadProfilePhoto({
    required List<int> bytes,
    required String filename,
  }) async {
    final response = await _apiClient.postMultipart(
      '/api/profile/photo',
      files: <MultipartFileData>[
        MultipartFileData(
          field: 'photo',
          filename: filename.trim().isEmpty ? 'profile.jpg' : filename.trim(),
          bytes: bytes,
          mimeType: 'image/jpeg',
        ),
      ],
    );
    final link = (response.data['photo_link'] as String? ?? '').trim();
    if (link.isEmpty) {
      throw ApiException(
        statusCode: response.statusCode,
        message: 'Invalid photo upload response.',
      );
    }
    return link;
  }

  Future<List<PersonSearchUser>> searchPeople({
    String query = '',
    int page = 1,
    int pageSize = 30,
  }) async {
    final response = await _apiClient.getJson(
      '/api/connections/search',
      query: <String, String>{
        'q': query.trim(),
        'page': '$page',
        'pageSize': '$pageSize',
      },
    );
    final raw = response.data['users'];
    if (raw is! List) return <PersonSearchUser>[];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(PersonSearchUser.fromJson)
        .where((user) => user.uid.isNotEmpty)
        .toList();
  }

  Future<PersonRelation> follow(String targetUid) async {
    final response = await _apiClient.postJson(
      '/api/connections/follow/request',
      body: <String, dynamic>{'targetUid': targetUid.trim()},
    );
    final state = (response.data['state'] as String? ?? '').trim();
    final requiresApproval = response.data['requiresApproval'] == true;
    if (state == 'following' || !requiresApproval) {
      return PersonRelation(
        isFollowing: true,
        followsYou: false,
        followRequestSent: false,
        followRequestReceived: false,
      );
    }
    return PersonRelation(
      isFollowing: false,
      followsYou: false,
      followRequestSent: true,
      followRequestReceived: false,
    );
  }

  Future<void> cancelFollowRequest(String targetUid) async {
    await _apiClient.postJson(
      '/api/connections/follow/cancel',
      body: <String, dynamic>{'targetUid': targetUid.trim()},
    );
  }

  Future<void> unfollow(String targetUid) async {
    await _apiClient.postJson(
      '/api/connections/unfollow',
      body: <String, dynamic>{'targetUid': targetUid.trim()},
    );
  }

  Future<List<LibraryDocument>> fetchContextDocuments(String query) async {
    final response = await _apiClient.getJson(
      '/api/library/documents',
      query: <String, String>{
        'q': query.trim(),
        'page': '1',
        'pageSize': '50',
        'sort': 'recent',
      },
    );

    final docsRaw = response.data['documents'];
    if (docsRaw is! List) return <LibraryDocument>[];
    return docsRaw
        .whereType<Map<String, dynamic>>()
        .map(LibraryDocument.fromJson)
        .where((doc) => doc.uuid.isNotEmpty)
        .toList();
  }
}
