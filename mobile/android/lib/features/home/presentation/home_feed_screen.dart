import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mime/mime.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/ui/app_theme.dart';
import '../../../core/ui/app_ui.dart';
import '../../library/data/library_models.dart';
import '../data/home_models.dart';
import '../data/home_repository.dart';

class HomeFeedScreen extends StatefulWidget {
  const HomeFeedScreen({super.key, required this.repository});

  final HomeRepository repository;

  @override
  State<HomeFeedScreen> createState() => _HomeFeedScreenState();
}

class _PickedPostAttachment {
  _PickedPostAttachment({
    required this.name,
    required this.bytes,
    required this.mimeType,
  });

  final String name;
  final List<int> bytes;
  final String mimeType;
}

class _HomeFeedScreenState extends State<HomeFeedScreen> {
  static const int _pageSize = 20;

  final Set<String> _likingPostIds = <String>{};
  final Set<String> _bookmarkingPostIds = <String>{};
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
    _PickedPostAttachment? pickedAttachment;
    LibraryDocument? selectedLibraryDocument;
    var submitting = false;
    String? formError;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (dialogContext, setDialogState) {
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
                  attachmentBytes: pickedAttachment?.bytes,
                  attachmentFilename: pickedAttachment?.name,
                  attachmentMimeType: pickedAttachment?.mimeType,
                  libraryDocumentUuid: selectedLibraryDocument?.uuid,
                  libraryDocumentTitle: selectedLibraryDocument?.title,
                );
                if (!dialogContext.mounted) return;
                Navigator.of(dialogContext).pop();
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
                    const SizedBox(height: 10),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'Attachment (optional)',
                        style: Theme.of(dialogContext).textTheme.labelMedium,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        OutlinedButton.icon(
                          onPressed: submitting
                              ? null
                              : () async {
                                  final picked = await _pickPostAttachment();
                                  if (!dialogContext.mounted ||
                                      picked == null) {
                                    return;
                                  }
                                  setDialogState(() {
                                    pickedAttachment = picked;
                                    selectedLibraryDocument = null;
                                    formError = null;
                                  });
                                },
                          icon: const Icon(Icons.attach_file),
                          label: const Text('Upload file'),
                        ),
                        OutlinedButton.icon(
                          onPressed: submitting
                              ? null
                              : () async {
                                  final selected =
                                      await _pickLibraryDocumentForPost();
                                  if (!dialogContext.mounted ||
                                      selected == null) {
                                    return;
                                  }
                                  setDialogState(() {
                                    selectedLibraryDocument = selected;
                                    pickedAttachment = null;
                                    formError = null;
                                  });
                                },
                          icon: const Icon(Icons.menu_book_outlined),
                          label: const Text('Open Library'),
                        ),
                      ],
                    ),
                    if (pickedAttachment != null) ...[
                      const SizedBox(height: 8),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(10),
                          color: AppPalette.stone,
                          border: Border.all(color: AppPalette.outlineSoft),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.insert_drive_file_outlined,
                                size: 18),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                pickedAttachment!.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            TextButton(
                              onPressed: submitting
                                  ? null
                                  : () {
                                      setDialogState(() {
                                        pickedAttachment = null;
                                      });
                                    },
                              child: const Text('Remove'),
                            ),
                          ],
                        ),
                      ),
                    ],
                    if (selectedLibraryDocument != null) ...[
                      const SizedBox(height: 8),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(10),
                          color: AppPalette.stone,
                          border: Border.all(color: AppPalette.outlineSoft),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.description_outlined, size: 18),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                selectedLibraryDocument!.title.trim().isEmpty
                                    ? 'Open Library document'
                                    : selectedLibraryDocument!.title.trim(),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            TextButton(
                              onPressed: submitting
                                  ? null
                                  : () {
                                      setDialogState(() {
                                        selectedLibraryDocument = null;
                                      });
                                    },
                              child: const Text('Remove'),
                            ),
                          ],
                        ),
                      ),
                    ],
                    if (formError != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        formError!,
                        style: TextStyle(
                          color: Theme.of(dialogContext).colorScheme.error,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: submitting
                      ? null
                      : () => Navigator.of(dialogContext).pop(),
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

  Future<_PickedPostAttachment?> _pickPostAttachment() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const <String>[
        'jpg',
        'jpeg',
        'png',
        'gif',
        'webp',
        'bmp',
        'mp4',
        'mov',
        'webm',
        'mkv',
        'avi',
      ],
      allowMultiple: false,
      withData: true,
    );

    if (result == null || result.files.isEmpty) {
      return null;
    }

    final file = result.files.first;
    var bytes = file.bytes;
    if (bytes == null && file.path != null && file.path!.isNotEmpty) {
      bytes = await File(file.path!).readAsBytes();
    }
    if (bytes == null || bytes.isEmpty) {
      if (mounted) {
        showAppSnackBar(context, 'Could not read selected file.',
            isError: true);
      }
      return null;
    }

    final fallbackMime = _inferMimeTypeFromName(file.name);
    final detectedMime = (lookupMimeType(
              file.name,
              headerBytes: bytes.take(16).toList(),
            ) ??
            fallbackMime)
        .trim()
        .toLowerCase();
    if (!detectedMime.startsWith('image/') &&
        !detectedMime.startsWith('video/')) {
      if (mounted) {
        showAppSnackBar(
          context,
          'Unsupported file type. Upload an image or video instead.',
          isError: true,
        );
      }
      return null;
    }

    return _PickedPostAttachment(
      name: file.name.trim().isEmpty ? 'attachment.bin' : file.name.trim(),
      bytes: bytes,
      mimeType: detectedMime,
    );
  }

  String _inferMimeTypeFromName(String filename) {
    final parts = filename.toLowerCase().split('.');
    final ext = parts.length > 1 ? parts.last : '';
    return switch (ext) {
      'jpg' || 'jpeg' => 'image/jpeg',
      'png' => 'image/png',
      'gif' => 'image/gif',
      'webp' => 'image/webp',
      'bmp' => 'image/bmp',
      'mp4' => 'video/mp4',
      'mov' => 'video/quicktime',
      'webm' => 'video/webm',
      'mkv' => 'video/x-matroska',
      'avi' => 'video/x-msvideo',
      _ => '',
    };
  }

  Future<LibraryDocument?> _pickLibraryDocumentForPost() async {
    final searchController = TextEditingController();
    List<LibraryDocument> docs = <LibraryDocument>[];
    String? localError;
    bool loadingDocs = true;
    bool initialized = false;

    Future<void> loadDocs(StateSetter setDialogState) async {
      setDialogState(() {
        loadingDocs = true;
        localError = null;
      });
      try {
        final result = await widget.repository.fetchLibraryDocumentsForPicker(
          query: searchController.text,
        );
        setDialogState(() {
          docs = result;
        });
      } on ApiException catch (error) {
        setDialogState(() {
          localError = error.message;
        });
      } catch (_) {
        setDialogState(() {
          localError = 'Unable to load documents.';
        });
      } finally {
        setDialogState(() {
          loadingDocs = false;
        });
      }
    }

    final selected = await showDialog<LibraryDocument>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (dialogContext, setDialogState) {
            if (!initialized) {
              initialized = true;
              Future<void>.microtask(() => loadDocs(setDialogState));
            }
            return AlertDialog(
              title: const Text('Select Open Library document'),
              content: SizedBox(
                width: 460,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: searchController,
                      decoration: const InputDecoration(
                        hintText: 'Search documents',
                        prefixIcon: Icon(Icons.search),
                      ),
                      onSubmitted: (_) => loadDocs(setDialogState),
                    ),
                    const SizedBox(height: 10),
                    if (loadingDocs) const LinearProgressIndicator(),
                    if (localError != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(localError!),
                      ),
                    const SizedBox(height: 8),
                    SizedBox(
                      height: 280,
                      child: docs.isEmpty
                          ? const Center(child: Text('No documents found.'))
                          : ListView.builder(
                              itemCount: docs.length,
                              itemBuilder: (context, index) {
                                final doc = docs[index];
                                return ListTile(
                                  title: Text(
                                    doc.title.trim().isEmpty
                                        ? 'Untitled document'
                                        : doc.title.trim(),
                                  ),
                                  subtitle: Text(
                                    '${doc.course} • ${doc.subject}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  onTap: () =>
                                      Navigator.of(dialogContext).pop(doc),
                                );
                              },
                            ),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => loadDocs(setDialogState),
                  child: const Text('Search'),
                ),
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: const Text('Close'),
                ),
              ],
            );
          },
        );
      },
    );

    searchController.dispose();
    return selected;
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

  Future<void> _toggleBookmark(FeedPost post) async {
    if (_bookmarkingPostIds.contains(post.id)) return;

    setState(() {
      _bookmarkingPostIds.add(post.id);
      _posts = _posts
          .map(
            (item) => item.id == post.id
                ? item.copyWith(bookmarked: !item.bookmarked)
                : item,
          )
          .toList();
    });

    try {
      await widget.repository.toggleBookmark(
        postId: post.id,
        currentlyBookmarked: post.bookmarked,
      );
      if (!mounted) return;
      showAppSnackBar(
        context,
        post.bookmarked ? 'Bookmark removed.' : 'Post bookmarked.',
      );
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _posts = _posts
            .map(
              (item) => item.id == post.id
                  ? item.copyWith(bookmarked: post.bookmarked)
                  : item,
            )
            .toList();
      });
      showAppSnackBar(context, 'Failed to update bookmark.', isError: true);
    } finally {
      if (mounted) {
        setState(() {
          _bookmarkingPostIds.remove(post.id);
        });
      }
    }
  }

  Future<void> _sharePost(FeedPost post) async {
    final link = widget.repository.buildPostShareLink(post.id);
    try {
      await Clipboard.setData(ClipboardData(text: link));
      if (!mounted) return;
      showAppSnackBar(context, 'Post link copied.');
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(context, 'Unable to copy link.', isError: true);
    }
  }

  Future<void> _reportPost(FeedPost post) async {
    try {
      await widget.repository.reportPost(postId: post.id);
      if (!mounted) return;
      showAppSnackBar(context, 'Report submitted. Thank you.');
    } on ApiException catch (error) {
      if (!mounted) return;
      showAppSnackBar(context, error.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(context, 'Unable to report post.', isError: true);
    }
  }

  Future<void> _openAttachment(FeedPost post) async {
    final attachment = post.attachment;
    if (attachment == null) return;

    if (attachment.normalizedType == 'library_doc') {
      await _openLibraryAttachment(attachment);
      return;
    }
    await _openAttachmentLink(attachment.link);
  }

  Future<void> _openLibraryAttachment(FeedAttachment attachment) async {
    final uuid = (attachment.libraryDocumentUuid ?? '').trim();
    if (uuid.isEmpty) {
      showAppSnackBar(context, 'Invalid Open Library document.', isError: true);
      return;
    }

    try {
      final link = await widget.repository.fetchLibraryDocumentLink(uuid);
      if (!mounted) return;
      if ((link ?? '').isEmpty) {
        showAppSnackBar(context, 'This document is unavailable.',
            isError: true);
        return;
      }
      await _openAttachmentLink(link);
    } on ApiException catch (error) {
      if (!mounted) return;
      showAppSnackBar(context, error.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(context, 'Unable to open document.', isError: true);
    }
  }

  Future<void> _openAttachmentLink(String? rawLink) async {
    final link = (rawLink ?? '').trim();
    if (link.isEmpty) {
      showAppSnackBar(context, 'Attachment link unavailable.', isError: true);
      return;
    }

    final uri = Uri.tryParse(link);
    if (uri == null) {
      showAppSnackBar(context, 'Invalid attachment URL.', isError: true);
      return;
    }

    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && mounted) {
      showAppSnackBar(context, 'Could not open attachment.', isError: true);
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

  Future<void> _handleMenuSelection(FeedPost post, String value) async {
    switch (value) {
      case 'bookmark':
        await _toggleBookmark(post);
        break;
      case 'share':
        await _sharePost(post);
        break;
      case 'report':
        await _reportPost(post);
        break;
    }
  }

  Widget _buildPostHeader(FeedPost post) {
    final name =
        post.uploaderName.trim().isEmpty ? 'Member' : post.uploaderName;
    final image = (post.uploaderPhotoLink ?? '').trim();

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CircleAvatar(
          radius: 20,
          backgroundColor: AppPalette.stone,
          foregroundImage: image.isEmpty ? null : NetworkImage(image),
          child: image.isEmpty ? const Icon(Icons.person_outline) : null,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const SizedBox(height: 2),
              Text(
                _formatDate(post.uploadDate),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppPalette.inkSoft,
                    ),
              ),
            ],
          ),
        ),
        PopupMenuButton<String>(
          tooltip: 'Post actions',
          onSelected: (value) => _handleMenuSelection(post, value),
          itemBuilder: (context) => [
            PopupMenuItem<String>(
              value: 'bookmark',
              child:
                  Text(post.bookmarked ? 'Remove bookmark' : 'Bookmark post'),
            ),
            const PopupMenuItem<String>(
              value: 'share',
              child: Text('Share link'),
            ),
            const PopupMenuItem<String>(
              value: 'report',
              child: Text('Report post'),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildAttachmentActionChip({
    required IconData icon,
    required String label,
    required VoidCallback onPressed,
  }) {
    return OutlinedButton.icon(
      onPressed: onPressed,
      icon: Icon(icon, size: 18),
      label: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
    );
  }

  Widget? _buildPostAttachment(FeedPost post) {
    final attachment = post.attachment;
    if (attachment == null) {
      return null;
    }

    final type = attachment.normalizedType;
    final hasLink = (attachment.link ?? '').trim().isNotEmpty;
    final title = (attachment.title ?? '').trim();
    final filename = (attachment.filename ?? '').trim();
    final label = title.isNotEmpty
        ? title
        : (filename.isNotEmpty ? filename : 'Open attachment');

    if (type == 'image' && hasLink) {
      final imageUrl = attachment.link!.trim();
      return GestureDetector(
        onTap: () => _openAttachmentLink(imageUrl),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: AspectRatio(
            aspectRatio: 16 / 10,
            child: Image.network(
              imageUrl,
              fit: BoxFit.cover,
              errorBuilder: (context, _, __) {
                return Container(
                  color: AppPalette.stone,
                  alignment: Alignment.center,
                  child: const Text('Unable to load image attachment'),
                );
              },
            ),
          ),
        ),
      );
    }

    if (type == 'video') {
      return _buildAttachmentActionChip(
        icon: Icons.videocam_outlined,
        label: label,
        onPressed: () => _openAttachment(post),
      );
    }

    if (type == 'library_doc') {
      return _buildAttachmentActionChip(
        icon: Icons.description_outlined,
        label: title.isEmpty ? 'Open Library document' : title,
        onPressed: () => _openAttachment(post),
      );
    }

    if (type == 'link' || hasLink) {
      return _buildAttachmentActionChip(
        icon: Icons.link_rounded,
        label: label,
        onPressed: () => _openAttachment(post),
      );
    }

    return null;
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
                    child: const Icon(Icons.edit_note_rounded,
                        color: Colors.white),
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
          final attachment = _buildPostAttachment(post);

          return AppSectionCard(
            margin: const EdgeInsets.only(bottom: 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildPostHeader(post),
                const SizedBox(height: 10),
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
                if (attachment != null) ...[
                  const SizedBox(height: 10),
                  attachment,
                ],
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
