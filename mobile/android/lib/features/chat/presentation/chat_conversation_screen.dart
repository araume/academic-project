import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/ui/app_theme.dart';
import '../../../core/ui/app_ui.dart';
import '../data/attachment_policy.dart';
import '../data/chat_models.dart';
import '../data/chat_repository.dart';

class ChatConversationScreen extends StatefulWidget {
  const ChatConversationScreen({
    super.key,
    required this.repository,
    required this.currentUid,
    required this.conversation,
    this.attachmentPicker,
  });

  final ChatRepository repository;
  final String currentUid;
  final ChatConversation conversation;
  final Future<PickedAttachment?> Function()? attachmentPicker;

  @override
  State<ChatConversationScreen> createState() => _ChatConversationScreenState();
}

class _ChatConversationScreenState extends State<ChatConversationScreen> {
  static const List<String> _quickEmojis = <String>[
    '😀',
    '😂',
    '🔥',
    '👍',
    '❤️',
    '👏',
    '🙏',
    '🎉',
    '🤔',
    '💡',
  ];

  final _inputController = TextEditingController();
  final _scrollController = ScrollController();

  Timer? _pollTimer;
  bool _loading = true;
  bool _sending = false;
  bool _conversationArchived = false;
  bool _conversationMuted = false;
  bool _typingActive = false;
  bool _showEmojiBar = false;
  DateTime? _lastTypingPing;
  String? _error;
  ChatMessage? _replyTarget;
  Uint8List? _pendingAttachmentBytes;
  String? _pendingAttachmentName;
  String? _pendingAttachmentMimeType;
  int? _pendingAttachmentSize;
  List<ChatMessage> _messages = <ChatMessage>[];
  List<ChatTypingUser> _typingUsers = <ChatTypingUser>[];

  @override
  void initState() {
    super.initState();
    _conversationArchived = widget.conversation.isArchived;
    _conversationMuted = widget.conversation.isMuted;
    _loadMessages();
    _loadTypingUsers();
    _inputController.addListener(_onComposerChanged);
    widget.repository.markConversationRead(widget.conversation.id).catchError((_) {});
    _pollTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      _loadMessages(silent: true);
      _loadTypingUsers(silent: true);
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _inputController.removeListener(_onComposerChanged);
    _inputController.dispose();
    _scrollController.dispose();
    _sendTypingSignal(false);
    super.dispose();
  }

  Future<void> _loadMessages({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final oldCount = _messages.length;
      final shouldAutoScroll = _isNearBottom();
      final messages =
          await widget.repository.fetchMessages(widget.conversation.id);
      if (!mounted) return;
      setState(() {
        _messages = messages;
      });
      if (!silent || (shouldAutoScroll && messages.length != oldCount)) {
        _jumpToBottom();
      }
    } on ApiException catch (error) {
      if (!mounted || silent) return;
      setState(() {
        _error = error.message;
      });
    } catch (_) {
      if (!mounted || silent) return;
      setState(() {
        _error = 'Failed to load messages.';
      });
    } finally {
      if (mounted && !silent) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _loadTypingUsers({bool silent = false}) async {
    try {
      final users =
          await widget.repository.fetchTypingUsers(widget.conversation.id);
      if (!mounted) return;
      setState(() {
        _typingUsers = users;
      });
    } catch (_) {
      if (!silent || !mounted) return;
    }
  }

  Future<void> _pickAttachment() async {
    try {
      final picked = await (widget.attachmentPicker?.call() ??
          _pickAttachmentWithFilePicker());
      if (picked == null) {
        return;
      }
      if (!mounted) return;
      final validation = AttachmentPolicy.validate(
        bytes: picked.bytes,
        filename: picked.name,
        providedMimeType: picked.mimeType,
      );
      if (!validation.isValid) {
        showAppSnackBar(context, validation.errorMessage!, isError: true);
        return;
      }

      setState(() {
        _pendingAttachmentBytes = picked.bytes;
        _pendingAttachmentName =
            picked.name.trim().isEmpty ? 'attachment.bin' : picked.name.trim();
        _pendingAttachmentMimeType = validation.mimeType;
        _pendingAttachmentSize = picked.bytes.length;
      });
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(context, 'Could not pick attachment.', isError: true);
    }
  }

  Future<PickedAttachment?> _pickAttachmentWithFilePicker() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: AttachmentPolicy.allowedExtensions,
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

    if (bytes == null) {
      return null;
    }

    return PickedAttachment(
      name: file.name.trim().isEmpty ? 'attachment.bin' : file.name.trim(),
      bytes: bytes,
    );
  }

  void _clearAttachment() {
    setState(() {
      _pendingAttachmentBytes = null;
      _pendingAttachmentName = null;
      _pendingAttachmentMimeType = null;
      _pendingAttachmentSize = null;
    });
  }

  void _toggleEmojiBar() {
    setState(() {
      _showEmojiBar = !_showEmojiBar;
    });
  }

  void _insertEmoji(String emoji) {
    final text = _inputController.text;
    final selection = _inputController.selection;

    if (!selection.isValid ||
        selection.baseOffset < 0 ||
        selection.extentOffset < 0) {
      _inputController.text = '$text$emoji';
      _inputController.selection =
          TextSelection.collapsed(offset: _inputController.text.length);
      return;
    }

    final start = selection.start;
    final end = selection.end;
    final nextText = text.replaceRange(start, end, emoji);
    final nextOffset = start + emoji.length;

    _inputController.text = nextText;
    _inputController.selection = TextSelection.collapsed(offset: nextOffset);
  }

  Future<void> _send() async {
    final text = _inputController.text.trim();
    final attachment = _pendingAttachmentBytes;
    if ((text.isEmpty && attachment == null) || _sending) return;

    final replyId = _replyTarget?.id;

    setState(() {
      _sending = true;
    });

    try {
      final message = await widget.repository.sendTextMessage(
        conversationId: widget.conversation.id,
        body: text,
        replyToMessageId: replyId,
        attachmentBytes: attachment,
        attachmentFilename: _pendingAttachmentName,
        attachmentMimeType: _pendingAttachmentMimeType,
      );
      if (!mounted) return;
      _inputController.clear();
      setState(() {
        _messages = <ChatMessage>[..._messages, message];
        _replyTarget = null;
        _pendingAttachmentBytes = null;
        _pendingAttachmentName = null;
        _pendingAttachmentMimeType = null;
        _pendingAttachmentSize = null;
      });
      _sendTypingSignal(false);
      _jumpToBottom();
      _loadTypingUsers(silent: true);
    } on ApiException catch (error) {
      if (!mounted) return;
      showAppSnackBar(context, error.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(context, 'Failed to send message.', isError: true);
    } finally {
      if (mounted) {
        setState(() {
          _sending = false;
        });
      }
    }
  }

  Future<void> _handleMessageAction(ChatMessage message, bool mine) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (context) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.reply),
                title: const Text('Reply'),
                onTap: () => Navigator.of(context).pop('reply'),
              ),
              if (!mine)
                ListTile(
                  leading: Icon(Icons.report,
                      color: Theme.of(context).colorScheme.error),
                  title: Text(
                    'Report message',
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                  onTap: () => Navigator.of(context).pop('report'),
                ),
              ListTile(
                leading: const Icon(Icons.close),
                title: const Text('Cancel'),
                onTap: () => Navigator.of(context).pop(),
              ),
            ],
          ),
        );
      },
    );

    if (action == 'reply') {
      setState(() {
        _replyTarget = message;
      });
      return;
    }

    if (action == 'report') {
      await _reportMessage(message.id);
    }
  }

  Future<void> _reportMessage(int messageId) async {
    final controller = TextEditingController();
    final messenger = ScaffoldMessenger.of(context);
    String? localError;
    bool submitting = false;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        final dialogNavigator = Navigator.of(dialogContext);
        return StatefulBuilder(
          builder: (dialogContext, setDialogState) {
            Future<void> submit() async {
              setDialogState(() {
                submitting = true;
                localError = null;
              });

              try {
                await widget.repository.reportMessage(
                  messageId: messageId,
                  reason: controller.text,
                );
                if (!mounted) return;
                dialogNavigator.pop();
                messenger.showSnackBar(
                  const SnackBar(content: Text('Message reported.')),
                );
              } on ApiException catch (error) {
                setDialogState(() {
                  localError = error.message;
                });
              } catch (_) {
                setDialogState(() {
                  localError = 'Failed to report message.';
                });
              } finally {
                setDialogState(() {
                  submitting = false;
                });
              }
            }

            return AlertDialog(
              title: const Text('Report message'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: controller,
                    minLines: 2,
                    maxLines: 4,
                    decoration: const InputDecoration(
                      hintText: 'Optional reason',
                    ),
                  ),
                  if (localError != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      localError!,
                      style:
                          TextStyle(color: Theme.of(context).colorScheme.error),
                    ),
                  ],
                ],
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
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Report'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  void _onComposerChanged() {
    final hasText = _inputController.text.trim().isNotEmpty;
    final now = DateTime.now();

    if (!hasText) {
      _sendTypingSignal(false);
      return;
    }

    if (!_typingActive) {
      _sendTypingSignal(true);
      return;
    }

    final lastPing = _lastTypingPing;
    if (lastPing == null || now.difference(lastPing).inSeconds >= 3) {
      _sendTypingSignal(true);
    }
  }

  void _sendTypingSignal(bool typing) {
    if (typing == _typingActive && typing == false) {
      return;
    }

    _typingActive = typing;
    _lastTypingPing = typing ? DateTime.now() : null;

    widget.repository
        .updateTyping(conversationId: widget.conversation.id, isTyping: typing)
        .catchError((_) {});
  }

  bool _isNearBottom() {
    if (!_scrollController.hasClients) return true;
    const threshold = 90.0;
    return (_scrollController.position.maxScrollExtent -
            _scrollController.offset) <=
        threshold;
  }

  void _jumpToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
      );
    });
  }

  Future<void> _runConversationAction(String action) async {
    try {
      if (action == 'mark_read') {
        await widget.repository.markConversationRead(widget.conversation.id);
        if (!mounted) return;
        showAppSnackBar(context, 'Conversation marked as read.');
        return;
      }

      if (action == 'archive') {
        await widget.repository.setConversationArchived(
          conversationId: widget.conversation.id,
          archived: true,
        );
        if (!mounted) return;
        setState(() {
          _conversationArchived = true;
        });
        showAppSnackBar(context, 'Conversation archived.');
        return;
      }

      if (action == 'unarchive') {
        await widget.repository.setConversationArchived(
          conversationId: widget.conversation.id,
          archived: false,
        );
        if (!mounted) return;
        setState(() {
          _conversationArchived = false;
        });
        showAppSnackBar(context, 'Conversation moved to active.');
        return;
      }

      if (action == 'mute') {
        await widget.repository.setConversationMuted(
          conversationId: widget.conversation.id,
          muted: true,
        );
        if (!mounted) return;
        setState(() {
          _conversationMuted = true;
        });
        showAppSnackBar(context, 'Notifications muted.');
        return;
      }

      if (action == 'unmute') {
        await widget.repository.setConversationMuted(
          conversationId: widget.conversation.id,
          muted: false,
        );
        if (!mounted) return;
        setState(() {
          _conversationMuted = false;
        });
        showAppSnackBar(context, 'Notifications unmuted.');
        return;
      }

      if (action == 'delete') {
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Delete conversation'),
            content: const Text('Delete this conversation from your chat list?'),
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
        if (confirmed != true) return;
        await widget.repository.deleteConversation(widget.conversation.id);
        if (!mounted) return;
        showAppSnackBar(context, 'Conversation deleted.');
        Navigator.of(context).pop();
      }
    } on ApiException catch (error) {
      if (!mounted) return;
      showAppSnackBar(context, error.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(context, 'Conversation action failed.', isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.conversation.title),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'Conversation options',
            onSelected: _runConversationAction,
            itemBuilder: (context) => [
              const PopupMenuItem<String>(
                value: 'mark_read',
                child: Row(
                  children: [
                    Icon(Icons.mark_chat_read_outlined),
                    SizedBox(width: 8),
                    Text('Mark as read'),
                  ],
                ),
              ),
              PopupMenuItem<String>(
                value: _conversationArchived ? 'unarchive' : 'archive',
                child: Row(
                  children: [
                    Icon(_conversationArchived
                        ? Icons.unarchive_outlined
                        : Icons.archive_outlined),
                    const SizedBox(width: 8),
                    Text(_conversationArchived ? 'Move to active' : 'Archive'),
                  ],
                ),
              ),
              PopupMenuItem<String>(
                value: _conversationMuted ? 'unmute' : 'mute',
                child: Row(
                  children: [
                    Icon(_conversationMuted
                        ? Icons.notifications_active_outlined
                        : Icons.notifications_off_outlined),
                    const SizedBox(width: 8),
                    Text(_conversationMuted
                        ? 'Unmute notifications'
                        : 'Mute notifications'),
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
          IconButton(
            onPressed: () {
              _loadMessages();
              _loadTypingUsers();
            },
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: AppPageBackground(
        child: Column(
          children: [
            if (_typingUsers.isNotEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
                child: Text(
                  _typingUsersText(_typingUsers),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            Expanded(child: _buildMessages()),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                child: AppSectionCard(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (_replyTarget != null)
                        Container(
                          key: const Key('chat_reply_preview'),
                          width: double.infinity,
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 8),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(10),
                            color: Theme.of(context)
                                .colorScheme
                                .surfaceContainerHighest,
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  'Replying to ${_replyTarget!.senderName}: ${_replyTarget!.bodyOrAttachmentLabel}',
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              ),
                              IconButton(
                                onPressed: () {
                                  setState(() {
                                    _replyTarget = null;
                                  });
                                },
                                icon: const Icon(Icons.close, size: 18),
                                tooltip: 'Cancel reply',
                              ),
                            ],
                          ),
                        ),
                      if (_pendingAttachmentBytes != null)
                        Container(
                          key: const Key('chat_pending_attachment_preview'),
                          width: double.infinity,
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 8),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(10),
                            color: Theme.of(context)
                                .colorScheme
                                .surfaceContainerHighest,
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.attach_file, size: 18),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  '${_pendingAttachmentName ?? 'attachment'} • ${_formatBytes(_pendingAttachmentSize ?? 0)}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              ),
                              IconButton(
                                onPressed: _clearAttachment,
                                icon: const Icon(Icons.close, size: 18),
                                tooltip: 'Remove attachment',
                              ),
                            ],
                          ),
                        ),
                      if (_showEmojiBar)
                        Container(
                          key: const Key('chat_emoji_bar'),
                          width: double.infinity,
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 6),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(10),
                            color: Theme.of(context)
                                .colorScheme
                                .surfaceContainerHighest,
                          ),
                          child: SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: Row(
                              children: _quickEmojis
                                  .map(
                                    (emoji) => Padding(
                                      padding: const EdgeInsets.only(right: 6),
                                      child: InkWell(
                                        onTap: () => _insertEmoji(emoji),
                                        borderRadius: BorderRadius.circular(16),
                                        child: Padding(
                                          padding: const EdgeInsets.all(6),
                                          child: Text(emoji,
                                              style: const TextStyle(
                                                  fontSize: 20)),
                                        ),
                                      ),
                                    ),
                                  )
                                  .toList(),
                            ),
                          ),
                        ),
                      Row(
                        children: [
                          IconButton(
                            key: const Key('chat_attach_button'),
                            onPressed: _sending ? null : _pickAttachment,
                            icon: const Icon(Icons.attach_file),
                            tooltip: 'Attach image/video',
                          ),
                          IconButton(
                            key: const Key('chat_emoji_toggle'),
                            onPressed: _toggleEmojiBar,
                            icon: Icon(_showEmojiBar
                                ? Icons.emoji_emotions
                                : Icons.emoji_emotions_outlined),
                            tooltip: 'Emoji',
                          ),
                          Expanded(
                            child: TextField(
                              controller: _inputController,
                              minLines: 1,
                              maxLines: 4,
                              decoration: const InputDecoration(
                                hintText: 'Type a message...',
                              ),
                              onSubmitted: (_) => _send(),
                            ),
                          ),
                          const SizedBox(width: 8),
                          IconButton(
                            key: const Key('chat_send_button'),
                            onPressed: _sending ? null : _send,
                            icon: _sending
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2),
                                  )
                                : const Icon(Icons.send),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMessages() {
    if (_loading) {
      return const AppLoadingState();
    }

    if (_error != null) {
      return AppErrorState(message: _error!, onRetry: _loadMessages);
    }

    if (_messages.isEmpty) {
      return const AppEmptyState(
        message: 'No messages yet.',
        icon: Icons.chat_bubble_outline,
      );
    }

    return RefreshIndicator(
      onRefresh: _loadMessages,
      child: ListView.builder(
        controller: _scrollController,
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        itemCount: _messages.length,
        itemBuilder: (context, index) {
          final message = _messages[index];
          final mine = message.senderUid == widget.currentUid;
          final bubbleColor = mine
              ? AppPalette.accentStrong
              : Theme.of(context).colorScheme.surfaceContainerHighest;
          final textColor = mine ? Colors.white : AppPalette.ink;
          final subtleTextColor = mine
              ? Colors.white.withValues(alpha: 0.78)
              : AppPalette.inkSoft;

          return Align(
            alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
            child: GestureDetector(
              onLongPress: () => _handleMessageAction(message, mine),
              child: Container(
                constraints: const BoxConstraints(maxWidth: 320),
                margin: const EdgeInsets.only(bottom: 8),
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: bubbleColor,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0x160F2639)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (!mine)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Text(
                          message.senderName,
                          style:
                              Theme.of(context).textTheme.labelSmall?.copyWith(
                                    color: AppPalette.accentStrong,
                                  ),
                        ),
                      ),
                    if (message.replyTo != null)
                      Container(
                        width: double.infinity,
                        margin: const EdgeInsets.only(bottom: 6),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 6),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(8),
                          color: mine
                              ? Colors.white.withValues(alpha: 0.16)
                              : Theme.of(context).colorScheme.surface,
                        ),
                        child: Text(
                          '${message.replyTo!.senderName}: ${message.replyTo!.bodySnippet}',
                          style:
                              Theme.of(context).textTheme.bodySmall?.copyWith(
                                    color: mine ? Colors.white : AppPalette.ink,
                                  ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    if (message.body.isNotEmpty)
                      Text(
                        message.body,
                        style: TextStyle(color: textColor),
                      ),
                    if (message.body.isEmpty && message.attachment == null)
                      Text(
                        message.bodyOrAttachmentLabel,
                        style: TextStyle(color: textColor),
                      ),
                    if (message.attachment != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: _buildAttachmentMessage(
                          message.attachment!,
                          textColor: textColor,
                        ),
                      ),
                    const SizedBox(height: 4),
                    Text(
                      _formatDate(message.createdAt),
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: subtleTextColor,
                          ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildAttachmentMessage(
    ChatAttachment attachment, {
    required Color textColor,
  }) {
    final type = attachment.type.trim().toLowerCase();
    if (type == 'image' &&
        attachment.link != null &&
        attachment.link!.isNotEmpty) {
      return InkWell(
        onTap: () => _openImagePreview(attachment.link!),
        borderRadius: BorderRadius.circular(8),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.network(
            attachment.link!,
            width: 220,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => const Text('[Image attachment]'),
          ),
        ),
      );
    }

    if (type == 'video') {
      final label = attachment.filename ?? '[Video attachment]';
      return InkWell(
        onTap: attachment.link == null || attachment.link!.isEmpty
            ? null
            : () => _openAttachmentLink(attachment.link!),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.videocam_outlined, size: 18, color: textColor),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                label,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: textColor),
              ),
            ),
          ],
        ),
      );
    }

    final fallbackLabel = attachment.filename ?? '[Attachment]';
    if (attachment.link == null || attachment.link!.isEmpty) {
      return Text(fallbackLabel, style: TextStyle(color: textColor));
    }
    return InkWell(
      onTap: () => _openAttachmentLink(attachment.link!),
      child: Text(
        fallbackLabel,
        style: TextStyle(
          color: textColor,
          decoration: TextDecoration.underline,
        ),
      ),
    );
  }

  Future<void> _openImagePreview(String imageUrl) async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return Dialog(
          insetPadding: const EdgeInsets.all(12),
          child: Stack(
            children: [
              InteractiveViewer(
                minScale: 0.8,
                maxScale: 4,
                child: Image.network(
                  imageUrl,
                  fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) =>
                      const Center(child: Text('Failed to load image')),
                ),
              ),
              Positioned(
                right: 8,
                top: 8,
                child: IconButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  icon: const Icon(Icons.close),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _openAttachmentLink(String rawLink) async {
    final link = rawLink.trim();
    if (link.isEmpty) return;
    final uri = Uri.tryParse(link);
    if (uri == null) return;

    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && mounted) {
      showAppSnackBar(context, 'Could not open attachment link.',
          isError: true);
    }
  }
}

String _typingUsersText(List<ChatTypingUser> users) {
  if (users.length == 1) {
    return '${users.first.displayName} is typing...';
  }
  if (users.length == 2) {
    return '${users[0].displayName} and ${users[1].displayName} are typing...';
  }
  return 'Several people are typing...';
}

String _formatDate(DateTime? value) {
  if (value == null) return 'Now';
  final local = value.toLocal();
  final time =
      '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  return time;
}

String _formatBytes(int bytes) {
  if (bytes >= 1024 * 1024) {
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
  if (bytes >= 1024) {
    return '${(bytes / 1024).toStringAsFixed(1)} KB';
  }
  return '$bytes B';
}

class PickedAttachment {
  PickedAttachment({
    required this.name,
    required this.bytes,
    this.mimeType,
  });

  final String name;
  final Uint8List bytes;
  final String? mimeType;
}
