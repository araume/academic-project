import 'package:flutter/material.dart';

import '../../../core/network/api_exception.dart';
import '../data/home_models.dart';
import '../data/home_repository.dart';

class HomeFeedScreen extends StatefulWidget {
  const HomeFeedScreen({super.key, required this.repository});

  final HomeRepository repository;

  @override
  State<HomeFeedScreen> createState() => _HomeFeedScreenState();
}

class _HomeFeedScreenState extends State<HomeFeedScreen> {
  final Set<String> _likingPostIds = <String>{};
  bool _loading = true;
  String? _error;
  List<FeedPost> _posts = <FeedPost>[];

  @override
  void initState() {
    super.initState();
    _loadPosts();
  }

  Future<void> _loadPosts() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final posts = await widget.repository.fetchPosts();
      if (!mounted) return;
      setState(() {
        _posts = posts;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Failed to load posts.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _openCreatePostDialog() async {
    final titleController = TextEditingController();
    final contentController = TextEditingController();
    var submitting = false;
    String? formError;

    await showDialog<void>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            Future<void> submit() async {
              final title = titleController.text.trim();
              final content = contentController.text.trim();
              if (title.isEmpty || content.isEmpty) {
                setDialogState(() {
                  formError = 'Title and content are required.';
                });
                return;
              }

              setDialogState(() {
                submitting = true;
                formError = null;
              });

              try {
                await widget.repository.createPost(
                  title: title,
                  content: content,
                );
                if (!context.mounted) return;
                Navigator.of(context).pop();
                await _loadPosts();
              } on ApiException catch (error) {
                setDialogState(() {
                  formError = error.message;
                });
              } catch (_) {
                setDialogState(() {
                  formError = 'Unable to create post.';
                });
              } finally {
                setDialogState(() {
                  submitting = false;
                });
              }
            }

            return AlertDialog(
              title: const Text('Create post'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: titleController,
                      decoration: const InputDecoration(labelText: 'Title'),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: contentController,
                      minLines: 3,
                      maxLines: 5,
                      decoration: const InputDecoration(labelText: 'Content'),
                    ),
                    if (formError != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        formError!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed:
                      submitting ? null : () => Navigator.of(context).pop(),
                  child: const Text('Cancel'),
                ),
                ElevatedButton(
                  onPressed: submitting ? null : submit,
                  child: submitting
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Post'),
                ),
              ],
            );
          },
        );
      },
    );

    titleController.dispose();
    contentController.dispose();
  }

  Future<void> _toggleLike(FeedPost post) async {
    if (_likingPostIds.contains(post.id)) return;

    setState(() {
      _likingPostIds.add(post.id);
      _posts = _posts
          .map(
            (item) => item.id == post.id
                ? item.copyWith(
                    liked: !item.liked,
                    likesCount: item.liked
                        ? (item.likesCount - 1)
                        : (item.likesCount + 1),
                  )
                : item,
          )
          .toList();
    });

    try {
      final likesCount = await widget.repository.toggleLike(
        postId: post.id,
        currentlyLiked: post.liked,
      );
      if (!mounted) return;
      setState(() {
        _posts = _posts
            .map(
              (item) => item.id == post.id
                  ? item.copyWith(likesCount: likesCount)
                  : item,
            )
            .toList();
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _posts = _posts
            .map(
              (item) => item.id == post.id
                  ? item.copyWith(
                      liked: post.liked,
                      likesCount: post.likesCount,
                    )
                  : item,
            )
            .toList();
      });
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Failed to update like.')));
    } finally {
      if (mounted) {
        setState(() {
          _likingPostIds.remove(post.id);
        });
      }
    }
  }

  Future<void> _openComments(FeedPost post) async {
    final count = await showModalBottomSheet<int>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _PostCommentsSheet(
        repository: widget.repository,
        postId: post.id,
        postTitle: post.title,
      ),
    );

    if (count == null || !mounted) return;
    setState(() {
      _posts = _posts
          .map(
            (item) =>
                item.id == post.id ? item.copyWith(commentsCount: count) : item,
          )
          .toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!),
              const SizedBox(height: 10),
              ElevatedButton(onPressed: _loadPosts, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadPosts,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
        itemCount: _posts.length + 1,
        itemBuilder: (context, index) {
          if (index == 0) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: FilledButton.icon(
                onPressed: _openCreatePostDialog,
                icon: const Icon(Icons.edit),
                label: const Text('Create post'),
              ),
            );
          }

          final post = _posts[index - 1];
          final isLiking = _likingPostIds.contains(post.id);

          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    post.title.isEmpty ? 'Untitled post' : post.title,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    post.content,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${post.uploaderName} • ${_formatDate(post.uploadDate)}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      OutlinedButton.icon(
                        onPressed: isLiking ? null : () => _toggleLike(post),
                        icon: Icon(
                          post.liked ? Icons.favorite : Icons.favorite_border,
                        ),
                        label: Text('${post.likesCount}'),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton.icon(
                        onPressed: () => _openComments(post),
                        icon: const Icon(Icons.comment_outlined),
                        label: Text('${post.commentsCount}'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _PostCommentsSheet extends StatefulWidget {
  const _PostCommentsSheet({
    required this.repository,
    required this.postId,
    required this.postTitle,
  });

  final HomeRepository repository;
  final String postId;
  final String postTitle;

  @override
  State<_PostCommentsSheet> createState() => _PostCommentsSheetState();
}

class _PostCommentsSheetState extends State<_PostCommentsSheet> {
  final _inputController = TextEditingController();
  bool _loading = true;
  bool _sending = false;
  String? _error;
  List<PostComment> _comments = <PostComment>[];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _inputController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final comments = await widget.repository.fetchComments(widget.postId);
      if (!mounted) return;
      setState(() {
        _comments = comments;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Failed to load comments.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _send() async {
    final text = _inputController.text.trim();
    if (text.isEmpty || _sending) return;

    setState(() {
      _sending = true;
    });

    try {
      final comment = await widget.repository.addComment(
        postId: widget.postId,
        content: text,
      );
      if (!mounted) return;
      _inputController.clear();
      setState(() {
        _comments = <PostComment>[..._comments, comment];
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Failed to send comment.')));
    } finally {
      if (mounted) {
        setState(() {
          _sending = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final height = MediaQuery.of(context).size.height * 0.8;

    return PopScope<int>(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) {
          _close();
        }
      },
      child: SizedBox(
        height: height,
        child: Padding(
          padding: EdgeInsets.only(
            left: 12,
            right: 12,
            top: 12,
            bottom: MediaQuery.of(context).viewInsets.bottom + 12,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      widget.postTitle.isEmpty ? 'Comments' : widget.postTitle,
                      style: Theme.of(context).textTheme.titleMedium,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  IconButton(onPressed: _close, icon: const Icon(Icons.close)),
                ],
              ),
              const SizedBox(height: 8),
              Expanded(
                child: _loading
                    ? const Center(child: CircularProgressIndicator())
                    : _error != null
                        ? Center(child: Text(_error!))
                        : _comments.isEmpty
                            ? const Center(child: Text('No comments yet.'))
                            : ListView.builder(
                                itemCount: _comments.length,
                                itemBuilder: (context, index) {
                                  final comment = _comments[index];
                                  return ListTile(
                                    contentPadding: EdgeInsets.zero,
                                    title: Text(comment.displayName),
                                    subtitle: Text(comment.content),
                                    trailing: Text(
                                      _formatDate(comment.createdAt),
                                      style:
                                          Theme.of(context).textTheme.bodySmall,
                                    ),
                                  );
                                },
                              ),
              ),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _inputController,
                      decoration: const InputDecoration(
                        hintText: 'Write a comment...',
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    onPressed: _sending ? null : _send,
                    icon: const Icon(Icons.send),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _close() {
    Navigator.of(context).pop(_comments.length);
  }
}

String _formatDate(DateTime? value) {
  if (value == null) return 'Now';
  final local = value.toLocal();
  final date =
      '${local.year.toString().padLeft(4, '0')}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}';
  final time =
      '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  return '$date $time';
}
