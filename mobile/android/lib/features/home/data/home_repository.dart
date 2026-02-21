import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
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
  }) async {
    final trimmedTitle = title.trim();
    final trimmedContent = content.trim();
    if (trimmedTitle.isEmpty || trimmedContent.isEmpty) {
      throw ApiException(
        statusCode: 400,
        message: 'Title and content are required.',
      );
    }

    await _apiClient.postJson(
      '/api/posts',
      body: <String, dynamic>{
        'title': trimmedTitle,
        'content': trimmedContent,
        'attachmentType': 'none',
      },
    );
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
