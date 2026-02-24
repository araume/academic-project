import 'package:flutter/material.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/ui/app_theme.dart';
import '../../../core/ui/app_ui.dart';
import '../data/home_models.dart';
import '../data/home_repository.dart';

class HomeFeedScreen extends StatefulWidget {
  const HomeFeedScreen({super.key, required this.repository});

  final HomeRepository repository;

  @override
  State<HomeFeedScreen> createState() => _HomeFeedScreenState();
}

class _HomeFeedScreenState extends State<HomeFeedScreen> {
  static const int _pageSize = 20;

  final Set<String> _likingPostIds = <String>{};
  final ScrollController _scrollController = ScrollController();

  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = true;
  String? _error;
  int _page = 1;
  List<FeedPost> _posts = <FeedPost>[];

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _loadPosts(refresh: true);
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients ||
        _loading ||
        _loadingMore ||
        !_hasMore) {
      return;
    }
    final max = _scrollController.position.maxScrollExtent;
    final current = _scrollController.offset;
    if (max - current < 260) {
      _loadPosts();
    }
  }

  Future<void> _loadPosts({bool refresh = false}) async {
    if (_loadingMore || (!refresh && !_hasMore)) return;

    if (refresh) {
      setState(() {
        _loading = true;
        _error = null;
        _hasMore = true;
        _page = 1;
      });
    } else {
      setState(() {
        _loadingMore = true;
      });
    }

    try {
      final nextPage = refresh ? 1 : _page;
      final posts = await widget.repository.fetchPosts(
        page: nextPage,
        pageSize: _pageSize,
      );
      if (!mounted) return;

      setState(() {
        if (refresh) {
          _posts = posts;
        } else {
          final merged = <String, FeedPost>{
            for (final post in _posts) post.id: post,
            for (final post in posts) post.id: post,
          };
          _posts = merged.values.toList();
        }

        _hasMore = posts.length >= _pageSize;
        _page = nextPage + 1;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      if (refresh) {
        setState(() {
          _error = error.message;
        });
      } else {
        showAppSnackBar(context, error.message, isError: true);
      }
    } catch (_) {
      if (!mounted) return;
      if (refresh) {
        setState(() {
          _error = 'Failed to load posts.';
        });
      } else {
        showAppSnackBar(context, 'Unable to load more posts.', isError: true);
      }
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadingMore = false;
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
                await _loadPosts(refresh: true);
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
                      decoration: const InputDecoration(
                        labelText: 'Title',
                        prefixIcon: Icon(Icons.title_rounded),
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: contentController,
                      minLines: 3,
                      maxLines: 5,
                      decoration: const InputDecoration(
                        labelText: 'Content',
                        prefixIcon: Icon(Icons.notes_rounded),
                      ),
                    ),
                    if (formError != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        formError!,
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.error),
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
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
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
            .map((item) => item.id == post.id
                ? item.copyWith(likesCount: likesCount)
                : item)
            .toList();
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _posts = _posts
            .map(
              (item) => item.id == post.id
                  ? item.copyWith(
                      liked: post.liked, likesCount: post.likesCount)
                  : item,
            )
            .toList();
      });
      showAppSnackBar(context, 'Failed to update like.', isError: true);
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
      showDragHandle: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      builder: (_) => _PostCommentsSheet(
        repository: widget.repository,
        postId: post.id,
        postTitle: post.title,
      ),
    );

    if (count == null || !mounted) return;
    setState(() {
      _posts = _posts
          .map((item) =>
              item.id == post.id ? item.copyWith(commentsCount: count) : item)
          .toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const AppLoadingState(label: 'Loading feed...');
    }

    if (_error != null) {
      return AppErrorState(
          message: _error!, onRetry: () => _loadPosts(refresh: true));
    }

    if (_posts.isEmpty) {
      return AppEmptyState(
        message: 'No posts yet. Start the conversation.',
        icon: Icons.forum_outlined,
        action: _openCreatePostDialog,
        actionLabel: 'Create post',
      );
    }

    return RefreshIndicator(
      onRefresh: () => _loadPosts(refresh: true),
      child: ListView.builder(
        controller: _scrollController,
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
        itemCount: _posts.length + 2,
        itemBuilder: (context, index) {
          if (index == 0) {
            return AppSectionCard(
              margin: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(999),
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [AppPalette.primary, AppPalette.accent],
                      ),
                    ),
                    child: const Icon(Icons.edit_note_rounded, color: Colors.white),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: AppPalette.accent,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      onPressed: _openCreatePostDialog,
                      icon: const Icon(Icons.draw_rounded),
                      label: const Text('Create post'),
                    ),
                  ),
                ],
              ),
            );
          }

          if (index == _posts.length + 1) {
            return buildLoadMoreIndicator(_loadingMore);
          }

          final post = _posts[index - 1];
          final isLiking = _likingPostIds.contains(post.id);

          return AppSectionCard(
            margin: const EdgeInsets.only(bottom: 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  post.title.isEmpty ? 'Untitled post' : post.title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 6),
                Text(
                  post.content,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: 10),
                Text(
                  '${post.uploaderName} • ${_formatDate(post.uploadDate)}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppPalette.inkSoft,
                      ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    OutlinedButton.icon(
                      onPressed: isLiking ? null : () => _toggleLike(post),
                      icon: Icon(
                          post.liked ? Icons.favorite : Icons.favorite_border),
                      label: Text('${post.likesCount}'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _openComments(post),
                      icon: const Icon(Icons.comment_outlined),
                      label: Text('${post.commentsCount}'),
                    ),
                  ],
                ),
              ],
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
      showAppSnackBar(context, error.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(context, 'Failed to send comment.', isError: true);
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
    final height = MediaQuery.of(context).size.height * 0.82;

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
            top: 8,
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
                    ? const AppLoadingState()
                    : _error != null
                        ? AppErrorState(message: _error!, onRetry: _load)
                        : _comments.isEmpty
                            ? const AppEmptyState(
                                message: 'No comments yet.',
                                icon: Icons.comment_outlined,
                              )
                            : ListView.builder(
                                itemCount: _comments.length,
                                itemBuilder: (context, index) {
                                  final comment = _comments[index];
                                  return AppSectionCard(
                                    margin: const EdgeInsets.only(bottom: 8),
                                    child: ListTile(
                                      contentPadding: EdgeInsets.zero,
                                      title: Text(comment.displayName),
                                      subtitle: Text(comment.content),
                                      trailing: Text(
                                        _formatDate(comment.createdAt),
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodySmall,
                                      ),
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
