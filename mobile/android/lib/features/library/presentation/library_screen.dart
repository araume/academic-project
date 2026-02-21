import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/network/api_exception.dart';
import '../data/library_models.dart';
import '../data/library_repository.dart';

class LibraryScreen extends StatefulWidget {
  const LibraryScreen({super.key, required this.repository});

  final LibraryRepository repository;

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> {
  final _searchController = TextEditingController();
  final Set<String> _likingDocIds = <String>{};

  Timer? _searchDebounce;
  bool _loading = true;
  String? _error;
  String _query = '';
  String _sort = 'recent';
  List<LibraryDocument> _documents = <LibraryDocument>[];

  @override
  void initState() {
    super.initState();
    _loadDocuments();
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadDocuments() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final docs = await widget.repository.fetchDocuments(
        query: _query,
        sort: _sort,
      );
      if (!mounted) return;
      setState(() {
        _documents = docs;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Failed to load documents.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
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
      _loadDocuments();
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
            .map(
              (item) => item.uuid == doc.uuid
                  ? item.copyWith(popularity: popularity)
                  : item,
            )
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
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Failed to update like.')));
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
      builder: (_) => _LibraryCommentsSheet(
        repository: widget.repository,
        documentUuid: doc.uuid,
        title: doc.title,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
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
                  const Text('Sort:'),
                  const SizedBox(width: 8),
                  DropdownButton<String>(
                    value: _sort,
                    items: const [
                      DropdownMenuItem(value: 'recent', child: Text('Recent')),
                      DropdownMenuItem(
                        value: 'popularity',
                        child: Text('Popularity'),
                      ),
                      DropdownMenuItem(value: 'views', child: Text('Views')),
                      DropdownMenuItem(value: 'az', child: Text('A-Z')),
                    ],
                    onChanged: (value) {
                      if (value == null) return;
                      setState(() {
                        _sort = value;
                      });
                      _loadDocuments();
                    },
                  ),
                  const Spacer(),
                  IconButton(
                    onPressed: _loadDocuments,
                    icon: const Icon(Icons.refresh),
                    tooltip: 'Refresh',
                  ),
                ],
              ),
            ],
          ),
        ),
        Expanded(child: _buildBody()),
      ],
    );
  }

  Widget _buildBody() {
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
              ElevatedButton(
                onPressed: _loadDocuments,
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    if (_documents.isEmpty) {
      return const Center(child: Text('No documents found.'));
    }

    return RefreshIndicator(
      onRefresh: _loadDocuments,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
        itemCount: _documents.length,
        itemBuilder: (context, index) {
          final doc = _documents[index];
          final isLiking = _likingDocIds.contains(doc.uuid);

          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    doc.title.isEmpty ? 'Untitled document' : doc.title,
                    style: Theme.of(context).textTheme.titleMedium,
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
                            'Course: ${doc.course.isEmpty ? '-' : doc.course}',
                      ),
                      _MetaChip(
                        label:
                            'Subject: ${doc.subject.isEmpty ? '-' : doc.subject}',
                      ),
                      _MetaChip(label: 'Views: ${doc.views}'),
                      _MetaChip(label: 'Likes: ${doc.popularity}'),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${doc.uploaderName} • ${_formatDate(doc.uploadDate)}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      OutlinedButton.icon(
                        onPressed: isLiking ? null : () => _toggleLike(doc),
                        icon: Icon(
                          doc.liked ? Icons.favorite : Icons.favorite_border,
                        ),
                        label: Text('${doc.popularity}'),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton.icon(
                        onPressed: () => _openComments(doc),
                        icon: const Icon(Icons.comment_outlined),
                        label: const Text('Comments'),
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
      final comments = await widget.repository.fetchComments(
        widget.documentUuid,
      );
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

    return SizedBox(
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
        borderRadius: BorderRadius.circular(20),
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
