import 'package:flutter/material.dart';

import '../../../core/network/api_exception.dart';
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
  bool _loading = true;
  String? _error;
  String? _currentUid;
  List<ChatConversation> _conversations = <ChatConversation>[];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final results = await Future.wait<Object>([
        widget.repository.fetchCurrentUid(),
        widget.repository.fetchConversations(),
      ]);
      final uid = results[0] as String;
      final convos = results[1] as List<ChatConversation>;

      if (!mounted) return;
      setState(() {
        _currentUid = uid;
        _conversations = convos;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Failed to load conversations.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _openConversation(ChatConversation conversation) async {
    final uid = _currentUid;
    if (uid == null || uid.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Current user not resolved yet. Please refresh.'),
        ),
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
    _load();
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
              ElevatedButton(onPressed: _load, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }

    if (_conversations.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('No conversations yet.'),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: _load,
                icon: const Icon(Icons.refresh),
                label: const Text('Refresh'),
              ),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 16),
        itemCount: _conversations.length,
        itemBuilder: (context, index) {
          final item = _conversations[index];

          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              onTap: () => _openConversation(item),
              leading: CircleAvatar(
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
              ),
              trailing: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    item.threadType,
                    style: Theme.of(context).textTheme.labelSmall,
                  ),
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
