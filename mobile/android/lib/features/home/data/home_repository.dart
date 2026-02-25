import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../library/data/library_models.dart';
import 'home_models.dart';

class HomeRepository {
  HomeRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;

  Future<List<FeedPost>> fetchPosts({int page = 1, int pageSize = 20}) async {
    final response = await _apiClient.getJson(
      '/api/posts',
      query: <String, String>{'page': '$page', 'pageSize': '$pageSize'},
    );

    final postsRaw = response.data['posts'];
    if (postsRaw is! List) {
      return <FeedPost>[];
    }

    return postsRaw
        .whereType<Map<String, dynamic>>()
        .map(FeedPost.fromJson)
        .where((post) => post.id.isNotEmpty)
        .toList();
  }

  Future<void> createPost({
    required String title,
    required String content,
    List<int>? attachmentBytes,
    String? attachmentFilename,
    String? attachmentMimeType,
    String? libraryDocumentUuid,
    String? libraryDocumentTitle,
  }) async {
    final trimmedTitle = title.trim();
    final trimmedContent = content.trim();
    if (trimmedTitle.isEmpty || trimmedContent.isEmpty) {
      throw ApiException(
        statusCode: 400,
        message: 'Title and content are required.',
      );
    }

    final hasFile = attachmentBytes != null &&
        attachmentBytes.isNotEmpty &&
        (attachmentFilename ?? '').trim().isNotEmpty;
    final hasLibraryDoc = (libraryDocumentUuid ?? '').trim().isNotEmpty;

    if (hasFile && hasLibraryDoc) {
      throw ApiException(
        statusCode: 400,
        message: 'Choose either an uploaded file or an Open Library document.',
      );
    }

    var attachmentType = 'none';
    if (hasLibraryDoc) {
      attachmentType = 'library_doc';
    } else if (hasFile) {
      final mimeType = (attachmentMimeType ?? '').trim().toLowerCase();
      if (mimeType.startsWith('image/')) {
        attachmentType = 'image';
      } else if (mimeType.startsWith('video/')) {
        attachmentType = 'video';
      } else {
        throw ApiException(
          statusCode: 400,
          message: 'Unsupported file type. Upload an image or video instead.',
        );
      }
    }

    await _apiClient.postMultipart(
      '/api/posts',
      fields: <String, String>{
        'title': trimmedTitle,
        'content': trimmedContent,
        'attachmentType': attachmentType,
        if (hasLibraryDoc) 'libraryDocumentUuid': libraryDocumentUuid!.trim(),
        if ((libraryDocumentTitle ?? '').trim().isNotEmpty)
          'attachmentTitle': libraryDocumentTitle!.trim(),
      },
      files: hasFile
          ? <MultipartFileData>[
              MultipartFileData(
                field: 'file',
                filename: attachmentFilename!.trim(),
                bytes: attachmentBytes,
                mimeType: (attachmentMimeType ?? '').trim().isEmpty
                    ? null
                    : attachmentMimeType!.trim(),
              ),
            ]
          : const <MultipartFileData>[],
    );
  }

  Future<List<LibraryDocument>> fetchLibraryDocumentsForPicker({
    String query = '',
    int pageSize = 50,
  }) async {
    final response = await _apiClient.getJson(
      '/api/library/documents',
      query: <String, String>{
        'q': query.trim(),
        'page': '1',
        'pageSize': '$pageSize',
        'sort': 'recent',
      },
    );
    final raw = response.data['documents'];
    if (raw is! List) return <LibraryDocument>[];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(LibraryDocument.fromJson)
        .where((doc) => doc.uuid.isNotEmpty)
        .toList();
  }

  Future<int> toggleLike({
    required String postId,
    required bool currentlyLiked,
  }) async {
    final response = await _apiClient.postJson(
      '/api/posts/$postId/like',
      body: <String, dynamic>{'action': currentlyLiked ? 'unlike' : 'like'},
    );
    return (response.data['likesCount'] as num? ?? 0).toInt();
  }

  Future<void> toggleBookmark({
    required String postId,
    required bool currentlyBookmarked,
  }) async {
    await _apiClient.postJson(
      '/api/posts/$postId/bookmark',
      body: <String, dynamic>{
        'action': currentlyBookmarked ? 'remove' : 'add',
      },
    );
  }

  Future<void> reportPost({
    required String postId,
    String? reason,
  }) async {
    await _apiClient.postJson(
      '/api/posts/$postId/report',
      body: <String, dynamic>{
        if ((reason ?? '').trim().isNotEmpty) 'reason': reason!.trim(),
      },
    );
  }

  String buildPostShareLink(String postId) {
    final safePostId = postId.trim();
    final baseUri = Uri.parse(_apiClient.baseUrl);
    final pathSegments =
        baseUri.pathSegments.where((segment) => segment.isNotEmpty).toList();
    if (pathSegments.isNotEmpty && pathSegments.last.toLowerCase() == 'api') {
      pathSegments.removeLast();
    }
    return baseUri.replace(
      pathSegments: <String>[...pathSegments, 'home'],
      queryParameters: <String, String>{'post': safePostId},
    ).toString();
  }

  Future<String?> fetchLibraryDocumentLink(String uuid) async {
    final safeUuid = uuid.trim();
    if (safeUuid.isEmpty) return null;
    final response =
        await _apiClient.getJson('/api/library/documents/$safeUuid');
    final raw = response.data['document'];
    if (raw is! Map<String, dynamic>) return null;
    return (raw['link'] as String?)?.trim();
  }

  Future<List<PostComment>> fetchComments(String postId) async {
    final response = await _apiClient.getJson('/api/posts/$postId/comments');
    final commentsRaw = response.data['comments'];
    if (commentsRaw is! List) {
      return <PostComment>[];
    }
    return commentsRaw
        .whereType<Map<String, dynamic>>()
        .map(PostComment.fromJson)
        .toList();
  }

  Future<PostComment> addComment({
    required String postId,
    required String content,
  }) async {
    final trimmed = content.trim();
    if (trimmed.isEmpty) {
      throw ApiException(statusCode: 400, message: 'Comment cannot be empty.');
    }

    final response = await _apiClient.postJson(
      '/api/posts/$postId/comments',
      body: <String, dynamic>{'content': trimmed},
    );
    final raw = response.data['comment'];
    if (raw is! Map<String, dynamic>) {
      throw ApiException(statusCode: 500, message: 'Invalid comment response.');
    }
    return PostComment.fromJson(raw);
  }
}
