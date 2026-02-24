import 'package:flutter/material.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/ui/app_theme.dart';
import '../../../core/ui/app_ui.dart';
import '../data/chat_models.dart';
import '../data/chat_repository.dart';
import 'chat_conversation_screen.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.repository});

  final ChatRepository repository;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  static const int _pageSize = 40;

  final ScrollController _scrollController = ScrollController();

  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = true;
  bool _startingConversation = false;
  String? _error;
  String? _currentUid;
  String _scope = 'active';
  int _page = 1;
  List<ChatConversation> _conversations = <ChatConversation>[];

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _load(refresh: true);
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
      _load();
    }
  }

  Future<void> _load({bool refresh = false}) async {
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
      final uid = _currentUid ?? await widget.repository.fetchCurrentUid();
      final nextPage = refresh ? 1 : _page;
      final convos = await widget.repository.fetchConversations(
        page: nextPage,
        pageSize: _pageSize,
        scope: _scope,
      );

      if (!mounted) return;
      setState(() {
        _currentUid = uid;
        if (refresh) {
          _conversations = convos;
        } else {
          final merged = <int, ChatConversation>{
            for (final c in _conversations) c.id: c,
            for (final c in convos) c.id: c,
          };
          _conversations = merged.values.toList();
        }
        _hasMore = convos.length >= _pageSize;
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
          _error = 'Failed to load conversations.';
        });
      } else {
        showAppSnackBar(context, 'Unable to load more conversations.',
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

  Future<void> _openConversation(ChatConversation conversation) async {
    final uid = _currentUid;
    if (uid == null || uid.isEmpty) {
      showAppSnackBar(
        context,
        'Current user not resolved yet. Please refresh.',
        isError: true,
      );
      return;
    }

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ChatConversationScreen(
          repository: widget.repository,
          currentUid: uid,
          conversation: conversation,
        ),
      ),
    );

    if (!mounted) return;
    _load(refresh: true);
  }

  Future<void> _changeScope(String nextScope) async {
    if (_scope == nextScope) return;
    setState(() {
      _scope = nextScope;
    });
    await _load(refresh: true);
  }

  Future<void> _runConversationAction(
    ChatConversation conversation,
    String action,
  ) async {
    try {
      if (action == 'mark_read') {
        await widget.repository.markConversationRead(conversation.id);
        if (!mounted) return;
        showAppSnackBar(context, 'Conversation marked as read.');
      } else if (action == 'mark_unread') {
        await widget.repository.markConversationUnread(conversation.id);
        if (!mounted) return;
        showAppSnackBar(context, 'Conversation marked as unread.');
      } else if (action == 'archive') {
        await widget.repository.setConversationArchived(
          conversationId: conversation.id,
          archived: true,
        );
        if (!mounted) return;
        showAppSnackBar(context, 'Conversation archived.');
      } else if (action == 'unarchive') {
        await widget.repository.setConversationArchived(
          conversationId: conversation.id,
          archived: false,
        );
        if (!mounted) return;
        showAppSnackBar(context, 'Conversation moved to active.');
      } else if (action == 'mute') {
        await widget.repository.setConversationMuted(
          conversationId: conversation.id,
          muted: true,
        );
        if (!mounted) return;
        showAppSnackBar(context, 'Notifications muted for this conversation.');
      } else if (action == 'unmute') {
        await widget.repository.setConversationMuted(
          conversationId: conversation.id,
          muted: false,
        );
        if (!mounted) return;
        showAppSnackBar(context, 'Notifications unmuted.');
      } else if (action == 'delete') {
        final confirmed = await _confirmDeleteConversation(conversation.title);
        if (!confirmed) return;
        await widget.repository.deleteConversation(conversation.id);
        if (!mounted) return;
        showAppSnackBar(context, 'Conversation deleted.');
      } else {
        return;
      }
      if (!mounted) return;
      await _load(refresh: true);
    } on ApiException catch (error) {
      if (!mounted) return;
      showAppSnackBar(context, error.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(context, 'Conversation action failed.', isError: true);
    }
  }

  Future<bool> _confirmDeleteConversation(String title) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete conversation'),
        content: Text('Delete "$title" from your chat list?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    return result == true;
  }

  Future<void> _startConversationFlow() async {
    if (_startingConversation) return;
    final query = await _askSearchQuery();
    if (query == null || query.trim().isEmpty) {
      return;
    }

    setState(() {
      _startingConversation = true;
    });

    try {
      final users = await widget.repository.searchUsers(query: query.trim());
      if (!mounted) return;
      if (users.isEmpty) {
        showAppSnackBar(context, 'No users found for "$query".', isError: true);
        return;
      }

      final user = await _pickUserForConversation(users);
      if (user == null || !mounted) return;

      final result =
          await widget.repository.startDirectConversation(targetUid: user.uid);

      if (!mounted) return;
      if (result.hasThread && result.threadId != null) {
        final startedConversation = ChatConversation(
          id: result.threadId!,
          title: user.displayName,
          threadType: 'direct',
          lastMessage: '',
          lastMessageAt: null,
        );
        await _openConversation(startedConversation);
      } else if (result.requiresApproval || result.state == 'pending') {
        showAppSnackBar(
          context,
          'Chat request sent. You can message once approved.',
        );
      } else {
        showAppSnackBar(
          context,
          'Conversation request processed.',
        );
      }
      if (!mounted) return;
      await _load(refresh: true);
    } on ApiException catch (error) {
      if (!mounted) return;
      showAppSnackBar(context, error.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(context, 'Unable to start conversation.', isError: true);
    } finally {
      if (mounted) {
        setState(() {
          _startingConversation = false;
        });
      }
    }
  }

  Future<String?> _askSearchQuery() async {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Start new conversation'),
        content: TextField(
          controller: controller,
          autofocus: true,
          textInputAction: TextInputAction.search,
          decoration: const InputDecoration(
            hintText: 'Search by name or course',
          ),
          onSubmitted: (_) => Navigator.of(context).pop(controller.text.trim()),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('Search'),
          ),
        ],
      ),
    );
  }

  Future<ChatSearchUser?> _pickUserForConversation(
    List<ChatSearchUser> users,
  ) async {
    return showModalBottomSheet<ChatSearchUser>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) {
        return SafeArea(
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.of(context).size.height * 0.75,
            ),
            child: ListView.separated(
              shrinkWrap: true,
              itemCount: users.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final user = users[index];
                final subtitleParts = <String>[
                  if ((user.course ?? '').isNotEmpty) user.course!,
                  if ((user.bio ?? '').isNotEmpty) user.bio!,
                ];
                final subtitle = subtitleParts.join(' • ');

                return ListTile(
                  title: Text(user.displayName),
                  subtitle: subtitle.isEmpty
                      ? Text(user.uid,
                          style: Theme.of(context).textTheme.bodySmall)
                      : Text(
                          subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                  onTap: () => Navigator.of(context).pop(user),
                );
              },
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
          child: AppSectionCard(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
            child: Row(
              children: [
                Expanded(
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _scopeChip('active', 'Active'),
                      _scopeChip('archived', 'Archived'),
                      _scopeChip('all', 'All'),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton.icon(
                  onPressed:
                      _startingConversation ? null : _startConversationFlow,
                  icon: _startingConversation
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.add_comment_outlined),
                  label: const Text('New'),
                ),
              ],
            ),
          ),
        ),
        Expanded(child: _buildConversationBody()),
      ],
    );
  }

  Widget _scopeChip(String value, String label) {
    final selected = _scope == value;
    return FilterChip(
      selected: selected,
      label: Text(label),
      onSelected: (_) => _changeScope(value),
    );
  }

  Widget _buildConversationBody() {
    if (_loading) {
      return const AppLoadingState(label: 'Loading conversations...');
    }

    if (_error != null) {
      return AppErrorState(
        message: _error!,
        onRetry: () => _load(refresh: true),
      );
    }

    if (_conversations.isEmpty) {
      return AppEmptyState(
        message: _emptyStateMessageForScope(_scope),
        icon: Icons.chat_bubble_outline,
        action: () => _load(refresh: true),
        actionLabel: 'Refresh',
      );
    }

    return RefreshIndicator(
      onRefresh: () => _load(refresh: true),
      child: ListView.builder(
        controller: _scrollController,
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
        itemCount: _conversations.length + 1,
        itemBuilder: (context, index) {
          if (index == _conversations.length) {
            return buildLoadMoreIndicator(_loadingMore);
          }
          final item = _conversations[index];
          return AppSectionCard(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              contentPadding: EdgeInsets.zero,
              onTap: () => _openConversation(item),
              leading: CircleAvatar(
                backgroundColor: AppPalette.sand,
                child: Text(
                  item.title.isNotEmpty
                      ? item.title.substring(0, 1).toUpperCase()
                      : '?',
                  style: const TextStyle(color: AppPalette.primary),
                ),
              ),
              title: Row(
                children: [
                  Expanded(
                    child: Text(
                      item.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (item.unreadCount > 0)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: AppPalette.accent,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        item.unreadCount > 99 ? '99+' : '${item.unreadCount}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                ],
              ),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.lastMessage.isEmpty
                          ? 'No messages yet'
                          : item.lastMessage,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: AppPalette.inkSoft,
                          ),
                    ),
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 8,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          _conversationMeta(item),
                          style: Theme.of(context).textTheme.labelSmall,
                        ),
                        if (item.isMuted)
                          const Icon(Icons.notifications_off_outlined, size: 14),
                        if (item.isArchived)
                          const Icon(Icons.archive_outlined, size: 14),
                      ],
                    ),
                  ],
                ),
              ),
              trailing: PopupMenuButton<String>(
                onSelected: (action) => _runConversationAction(item, action),
                itemBuilder: (context) => [
                  PopupMenuItem<String>(
                    value: item.isRead ? 'mark_unread' : 'mark_read',
                    child: Row(
                      children: [
                        Icon(item.isRead
                            ? Icons.mark_chat_unread_outlined
                            : Icons.mark_chat_read_outlined),
                        const SizedBox(width: 8),
                        Text(item.isRead ? 'Mark as unread' : 'Mark as read'),
                      ],
                    ),
                  ),
                  PopupMenuItem<String>(
                    value: item.isArchived ? 'unarchive' : 'archive',
                    child: Row(
                      children: [
                        Icon(item.isArchived
                            ? Icons.unarchive_outlined
                            : Icons.archive_outlined),
                        const SizedBox(width: 8),
                        Text(item.isArchived ? 'Move to active' : 'Archive'),
                      ],
                    ),
                  ),
                  PopupMenuItem<String>(
                    value: item.isMuted ? 'unmute' : 'mute',
                    child: Row(
                      children: [
                        Icon(item.isMuted
                            ? Icons.notifications_active_outlined
                            : Icons.notifications_off_outlined),
                        const SizedBox(width: 8),
                        Text(item.isMuted ? 'Unmute notifications' : 'Mute notifications'),
                      ],
                    ),
                  ),
                  const PopupMenuDivider(),
                  const PopupMenuItem<String>(
                    value: 'delete',
                    child: Row(
                      children: [
                        Icon(Icons.delete_outline),
                        SizedBox(width: 8),
                        Text('Delete conversation'),
                      ],
                    ),
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

String _conversationMeta(ChatConversation item) {
  final labels = <String>[
    item.threadType,
    _formatDate(item.lastMessageAt),
  ];
  return labels.where((entry) => entry.trim().isNotEmpty).join(' • ');
}

String _emptyStateMessageForScope(String scope) {
  if (scope == 'archived') {
    return 'No archived conversations.';
  }
  if (scope == 'all') {
    return 'No conversations found.';
  }
  return 'No active conversations yet.';
}

String _formatDate(DateTime? value) {
  if (value == null) return '-';
  final local = value.toLocal();
  final month = local.month.toString().padLeft(2, '0');
  final day = local.day.toString().padLeft(2, '0');
  final hour = local.hour.toString().padLeft(2, '0');
  final minute = local.minute.toString().padLeft(2, '0');
  return '$month/$day $hour:$minute';
}
