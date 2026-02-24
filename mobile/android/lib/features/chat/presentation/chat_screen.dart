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
  String? _error;
  String? _currentUid;
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

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const AppLoadingState(label: 'Loading conversations...');
    }

    if (_error != null) {
      return AppErrorState(
          message: _error!, onRetry: () => _load(refresh: true));
    }

    if (_conversations.isEmpty) {
      return AppEmptyState(
        message: 'No conversations yet.',
        icon: Icons.chat_bubble_outline,
        action: () => _load(refresh: true),
        actionLabel: 'Refresh',
      );
    }

    return RefreshIndicator(
      onRefresh: () => _load(refresh: true),
      child: ListView.builder(
        controller: _scrollController,
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 16),
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
                backgroundColor: const Color(0xFFE8E3DC),
                child: Text(
                  item.title.isNotEmpty
                      ? item.title.substring(0, 1).toUpperCase()
                      : '?',
                ),
              ),
              title: Text(item.title),
              subtitle: Text(
                item.lastMessage.isEmpty ? 'No messages yet' : item.lastMessage,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppPalette.inkSoft,
                    ),
              ),
              trailing: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(item.threadType,
                      style: Theme.of(context).textTheme.labelSmall),
                  Text(
                    _formatDate(item.lastMessageAt),
                    style: Theme.of(context).textTheme.labelSmall,
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

String _formatDate(DateTime? value) {
  if (value == null) return '-';
  final local = value.toLocal();
  final month = local.month.toString().padLeft(2, '0');
  final day = local.day.toString().padLeft(2, '0');
  final hour = local.hour.toString().padLeft(2, '0');
  final minute = local.minute.toString().padLeft(2, '0');
  return '$month/$day $hour:$minute';
}
