import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/ui/app_theme.dart';
import '../../../core/ui/app_ui.dart';
import '../data/library_models.dart';
import '../data/library_repository.dart';

class LibraryScreen extends StatefulWidget {
  const LibraryScreen({super.key, required this.repository});

  final LibraryRepository repository;

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> {
  static const int _pageSize = 20;

  final _searchController = TextEditingController();
  final Set<String> _likingDocIds = <String>{};
  final ScrollController _scrollController = ScrollController();

  Timer? _searchDebounce;
  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = true;
  String? _error;
  String _query = '';
  String _sort = 'recent';
  int _page = 1;
  List<LibraryDocument> _documents = <LibraryDocument>[];

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _loadDocuments(refresh: true);
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    _searchController.dispose();
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
      _loadDocuments();
    }
  }

  Future<void> _loadDocuments({bool refresh = false}) async {
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
      final docs = await widget.repository.fetchDocuments(
        query: _query,
        sort: _sort,
        page: nextPage,
        pageSize: _pageSize,
      );
      if (!mounted) return;
      setState(() {
        if (refresh) {
          _documents = docs;
        } else {
          final merged = <String, LibraryDocument>{
            for (final doc in _documents) doc.uuid: doc,
            for (final doc in docs) doc.uuid: doc,
          };
          _documents = merged.values.toList();
        }
        _hasMore = docs.length >= _pageSize;
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
          _error = 'Failed to load documents.';
        });
      } else {
        showAppSnackBar(context, 'Unable to load more documents.',
            isError: true);
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

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 350), () {
      if (!mounted) return;
      setState(() {
        _query = value.trim();
      });
      _loadDocuments(refresh: true);
    });
  }

  Future<void> _toggleLike(LibraryDocument doc) async {
    if (_likingDocIds.contains(doc.uuid)) return;

    setState(() {
      _likingDocIds.add(doc.uuid);
      _documents = _documents
          .map(
            (item) => item.uuid == doc.uuid
                ? item.copyWith(
                    liked: !item.liked,
                    popularity: item.liked
                        ? (item.popularity - 1)
                        : (item.popularity + 1),
                  )
                : item,
          )
          .toList();
    });

    try {
      final popularity = await widget.repository.toggleLike(
        documentUuid: doc.uuid,
        currentlyLiked: doc.liked,
      );
      if (!mounted) return;
      setState(() {
        _documents = _documents
            .map((item) => item.uuid == doc.uuid
                ? item.copyWith(popularity: popularity)
                : item)
            .toList();
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _documents = _documents
            .map(
              (item) => item.uuid == doc.uuid
                  ? item.copyWith(liked: doc.liked, popularity: doc.popularity)
                  : item,
            )
            .toList();
      });
      showAppSnackBar(context, 'Failed to update like.', isError: true);
    } finally {
      if (mounted) {
        setState(() {
          _likingDocIds.remove(doc.uuid);
        });
      }
    }
  }

  Future<void> _openComments(LibraryDocument doc) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _LibraryCommentsSheet(
        repository: widget.repository,
        documentUuid: doc.uuid,
        title: doc.title,
      ),
    );
  }

  Future<void> _openDocument(LibraryDocument doc) async {
    try {
      final updatedViews = await widget.repository.registerView(doc.uuid);
      var link = (doc.link ?? '').trim();
      if (link.isEmpty) {
        final fullDoc = await widget.repository.fetchDocument(doc.uuid);
        link = (fullDoc.link ?? '').trim();
      }

      if (!mounted) return;
      setState(() {
        _documents = _documents
            .map((item) => item.uuid == doc.uuid
                ? item.copyWith(views: updatedViews)
                : item)
            .toList();
      });

      if (link.isEmpty) {
        showAppSnackBar(context, 'Document link is unavailable.',
            isError: true);
        return;
      }

      final uri = Uri.tryParse(link);
      if (uri == null) {
        showAppSnackBar(context, 'Invalid document URL.', isError: true);
        return;
      }

      final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!opened && mounted) {
        showAppSnackBar(context, 'Could not open document link.',
            isError: true);
      }
    } on ApiException catch (error) {
      if (!mounted) return;
      showAppSnackBar(context, error.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(context, 'Unable to open document.', isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
          child: AppSectionCard(
            child: Column(
              children: [
                TextField(
                  controller: _searchController,
                  decoration: const InputDecoration(
                    hintText: 'Search title, subject, description...',
                    prefixIcon: Icon(Icons.search),
                  ),
                  onChanged: _onSearchChanged,
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Text(
                      'Sort:',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: AppPalette.inkSoft,
                          ),
                    ),
                    const SizedBox(width: 8),
                    DropdownButton<String>(
                      value: _sort,
                      items: const [
                        DropdownMenuItem(
                            value: 'recent', child: Text('Recent')),
                        DropdownMenuItem(
                            value: 'popularity', child: Text('Popularity')),
                        DropdownMenuItem(value: 'views', child: Text('Views')),
                        DropdownMenuItem(value: 'az', child: Text('A-Z')),
                      ],
                      onChanged: (value) {
                        if (value == null) return;
                        setState(() {
                          _sort = value;
                        });
                        _loadDocuments(refresh: true);
                      },
                    ),
                    const Spacer(),
                    IconButton(
                      onPressed: () => _loadDocuments(refresh: true),
                      icon: const Icon(Icons.refresh),
                      tooltip: 'Refresh',
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        Expanded(child: _buildBody()),
      ],
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const AppLoadingState(label: 'Loading library...');
    }

    if (_error != null) {
      return AppErrorState(
        message: _error!,
        onRetry: () => _loadDocuments(refresh: true),
      );
    }

    if (_documents.isEmpty) {
      return const AppEmptyState(
        message: 'No documents found.',
        icon: Icons.menu_book_outlined,
      );
    }

    return RefreshIndicator(
      onRefresh: () => _loadDocuments(refresh: true),
      child: ListView.builder(
        controller: _scrollController,
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
        itemCount: _documents.length + 1,
        itemBuilder: (context, index) {
          if (index == _documents.length) {
            return buildLoadMoreIndicator(_loadingMore);
          }

          final doc = _documents[index];
          final isLiking = _likingDocIds.contains(doc.uuid);

          return AppSectionCard(
            margin: const EdgeInsets.only(bottom: 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  doc.title.isEmpty ? 'Untitled document' : doc.title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                if (doc.description.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(doc.description),
                ],
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _MetaChip(
                        label:
                            'Course: ${doc.course.isEmpty ? '-' : doc.course}'),
                    _MetaChip(
                        label:
                            'Subject: ${doc.subject.isEmpty ? '-' : doc.subject}'),
                    _MetaChip(label: 'Views: ${doc.views}'),
                    _MetaChip(label: 'Likes: ${doc.popularity}'),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  '${doc.uploaderName} • ${_formatDate(doc.uploadDate)}',
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
                      onPressed: isLiking ? null : () => _toggleLike(doc),
                      icon: Icon(
                          doc.liked ? Icons.favorite : Icons.favorite_border),
                      label: Text('${doc.popularity}'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _openComments(doc),
                      icon: const Icon(Icons.comment_outlined),
                      label: const Text('Comments'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _openDocument(doc),
                      icon: const Icon(Icons.open_in_new),
                      label: const Text('Open'),
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

class _LibraryCommentsSheet extends StatefulWidget {
  const _LibraryCommentsSheet({
    required this.repository,
    required this.documentUuid,
    required this.title,
  });

  final LibraryRepository repository;
  final String documentUuid;
  final String title;

  @override
  State<_LibraryCommentsSheet> createState() => _LibraryCommentsSheetState();
}

class _LibraryCommentsSheetState extends State<_LibraryCommentsSheet> {
  final _inputController = TextEditingController();

  bool _loading = true;
  bool _sending = false;
  String? _error;
  List<LibraryComment> _comments = <LibraryComment>[];

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
      final comments =
          await widget.repository.fetchComments(widget.documentUuid);
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
        documentUuid: widget.documentUuid,
        content: text,
      );
      if (!mounted) return;
      _inputController.clear();
      setState(() {
        _comments = <LibraryComment>[..._comments, comment];
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

    return SizedBox(
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
                    widget.title.isEmpty ? 'Document comments' : widget.title,
                    style: Theme.of(context).textTheme.titleMedium,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
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
                                      style:
                                          Theme.of(context).textTheme.bodySmall,
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
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0x220F2639)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Text(label, style: Theme.of(context).textTheme.bodySmall),
      ),
    );
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
