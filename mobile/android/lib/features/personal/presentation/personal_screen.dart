import 'dart:async';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/notifications/push_notifications_service.dart';
import '../../../core/ui/app_theme.dart';
import '../../../core/ui/app_ui.dart';
import '../../library/data/library_models.dart';
import '../data/personal_models.dart';
import '../data/personal_repository.dart';

class PersonalScreen extends StatelessWidget {
  const PersonalScreen({
    super.key,
    required this.repository,
    required this.pushNotificationsService,
  });

  final PersonalRepository repository;
  final PushNotificationsService pushNotificationsService;

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 5,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
            child: AppSectionCard(
              child: const TabBar(
                isScrollable: true,
                tabs: [
                  Tab(text: 'Journals'),
                  Tab(text: 'Tasks'),
                  Tab(text: 'Assistant'),
                  Tab(text: 'Profile'),
                  Tab(text: 'People'),
                ],
              ),
            ),
          ),
          Expanded(
            child: TabBarView(
              children: [
                _JournalsTab(repository: repository),
                _TasksTab(
                  repository: repository,
                  pushNotificationsService: pushNotificationsService,
                ),
                _AssistantTab(repository: repository),
                _ProfileTab(repository: repository),
                _PeopleTab(repository: repository),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _JournalsTab extends StatefulWidget {
  const _JournalsTab({required this.repository});

  final PersonalRepository repository;

  @override
  State<_JournalsTab> createState() => _JournalsTabState();
}

class _JournalsTabState extends State<_JournalsTab> {
  bool _loading = true;
  String? _error;
  List<PersonalJournal> _entries = <PersonalJournal>[];
  List<PersonalFolder> _folders = <PersonalFolder>[];

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
      final results = await Future.wait([
        widget.repository.fetchJournals(),
        widget.repository.fetchFolders(),
      ]);
      if (!mounted) return;
      setState(() {
        _entries = results[0] as List<PersonalJournal>;
        _folders = results[1] as List<PersonalFolder>;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Unable to load journals.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _createFolder() async {
    final controller = TextEditingController();
    final shouldCreate = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Create folder'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(hintText: 'Folder name'),
          autofocus: true,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Create'),
          ),
        ],
      ),
    );

    if (shouldCreate != true) return;
    try {
      await widget.repository.createFolder(controller.text);
      await _load();
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    }
  }

  Future<void> _deleteFolder(PersonalFolder folder) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete folder'),
        content: Text('Delete "${folder.name}"? Journals will be ungrouped.'),
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
    try {
      await widget.repository.deleteFolder(folder.id);
      await _load();
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    }
  }

  Future<void> _openEditor({PersonalJournal? existing}) async {
    final titleController = TextEditingController(text: existing?.title ?? '');
    final contentController =
        TextEditingController(text: existing?.content ?? '');
    final tagsController =
        TextEditingController(text: (existing?.tags ?? <String>[]).join(', '));
    String selectedFolder = existing?.folder ?? '';

    final saved = await showDialog<bool>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title:
                  Text(existing == null ? 'New journal entry' : 'Edit journal'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: titleController,
                      decoration: const InputDecoration(labelText: 'Title'),
                    ),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      initialValue:
                          selectedFolder.isEmpty ? '' : selectedFolder,
                      items: [
                        const DropdownMenuItem(
                          value: '',
                          child: Text('Ungrouped'),
                        ),
                        ..._folders.map(
                          (folder) => DropdownMenuItem(
                            value: folder.name,
                            child: Text(folder.name),
                          ),
                        ),
                      ],
                      onChanged: (value) {
                        setDialogState(() {
                          selectedFolder = value ?? '';
                        });
                      },
                      decoration: const InputDecoration(labelText: 'Folder'),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: tagsController,
                      decoration: const InputDecoration(
                        labelText: 'Tags (comma-separated)',
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: contentController,
                      minLines: 8,
                      maxLines: 12,
                      decoration: const InputDecoration(labelText: 'Content'),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('Cancel'),
                ),
                ElevatedButton(
                  onPressed: () => Navigator.of(context).pop(true),
                  child: const Text('Save'),
                ),
              ],
            );
          },
        );
      },
    );

    if (saved != true) return;
    if (titleController.text.trim().isEmpty ||
        contentController.text.trim().isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Title and content are required.')),
      );
      return;
    }

    try {
      if (existing == null) {
        await widget.repository.createJournal(
          title: titleController.text,
          content: contentController.text,
          folder: selectedFolder,
          tags: tagsController.text,
        );
      } else {
        await widget.repository.updateJournal(
          journalId: existing.id,
          title: titleController.text,
          content: contentController.text,
          folder: selectedFolder,
          tags: tagsController.text,
        );
      }
      await _load();
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    }
  }

  Future<void> _deleteJournal(PersonalJournal entry) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete journal'),
        content: Text('Delete "${entry.title}"?'),
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
    try {
      await widget.repository.deleteJournal(entry.id);
      await _load();
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    }
  }

  void _openReadView(PersonalJournal entry) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(entry.title),
        content: SingleChildScrollView(
          child: Text(entry.content.isEmpty ? 'No content.' : entry.content),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!),
            const SizedBox(height: 8),
            ElevatedButton(onPressed: _load, child: const Text('Retry')),
          ],
        ),
      );
    }

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: _createFolder,
                icon: const Icon(Icons.create_new_folder_outlined),
                label: const Text('New folder'),
              ),
              OutlinedButton.icon(
                onPressed: () => _openEditor(),
                icon: const Icon(Icons.note_add_outlined),
                label: const Text('New journal'),
              ),
              IconButton(
                onPressed: _load,
                icon: const Icon(Icons.refresh),
                tooltip: 'Refresh',
              ),
            ],
          ),
        ),
        if (_folders.isNotEmpty)
          ExpansionTile(
            title: const Text('Folders'),
            children: _folders
                .map(
                  (folder) => ListTile(
                    dense: true,
                    title: Text(folder.name),
                    trailing: IconButton(
                      onPressed: () => _deleteFolder(folder),
                      icon: const Icon(Icons.delete_outline),
                    ),
                  ),
                )
                .toList(),
          ),
        Expanded(
          child: _entries.isEmpty
              ? const Center(child: Text('No journal entries yet.'))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
                    itemCount: _entries.length,
                    itemBuilder: (context, index) {
                      final entry = _entries[index];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        child: ListTile(
                          title: Text(
                            entry.title.isEmpty
                                ? 'Untitled entry'
                                : entry.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          subtitle: Text(
                            '${entry.folder ?? 'Ungrouped'} • ${_formatDateTime(entry.updatedAt)}',
                          ),
                          onTap: () => _openReadView(entry),
                          trailing: PopupMenuButton<String>(
                            onSelected: (value) {
                              if (value == 'view') _openReadView(entry);
                              if (value == 'edit') _openEditor(existing: entry);
                              if (value == 'delete') _deleteJournal(entry);
                            },
                            itemBuilder: (context) => const [
                              PopupMenuItem(value: 'view', child: Text('View')),
                              PopupMenuItem(value: 'edit', child: Text('Edit')),
                              PopupMenuItem(
                                value: 'delete',
                                child: Text('Delete'),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
        ),
      ],
    );
  }
}

class _TasksTab extends StatefulWidget {
  const _TasksTab({
    required this.repository,
    required this.pushNotificationsService,
  });

  final PersonalRepository repository;
  final PushNotificationsService pushNotificationsService;

  @override
  State<_TasksTab> createState() => _TasksTabState();
}

class _TasksTabState extends State<_TasksTab> {
  bool _loading = true;
  String? _error;
  List<PersonalTask> _tasks = <PersonalTask>[];

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
      final tasks = await widget.repository.fetchTasks();
      if (!mounted) return;
      setState(() {
        _tasks = tasks;
      });
      await widget.pushNotificationsService.syncTaskDueReminders(tasks);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Unable to load tasks.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _createTask() async {
    final titleController = TextEditingController();
    final descriptionController = TextEditingController();
    final tagsController = TextEditingController();
    String priority = 'normal';
    DateTime? dueDate;

    final saved = await showDialog<bool>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) => AlertDialog(
            title: const Text('Create task'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: titleController,
                    decoration: const InputDecoration(labelText: 'Title'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: descriptionController,
                    minLines: 2,
                    maxLines: 4,
                    decoration: const InputDecoration(labelText: 'Description'),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue: priority,
                    items: const [
                      DropdownMenuItem(value: 'low', child: Text('Low')),
                      DropdownMenuItem(value: 'normal', child: Text('Normal')),
                      DropdownMenuItem(value: 'urgent', child: Text('Urgent')),
                    ],
                    onChanged: (value) {
                      setDialogState(() {
                        priority = value ?? 'normal';
                      });
                    },
                    decoration: const InputDecoration(labelText: 'Priority'),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          dueDate == null
                              ? 'No due date'
                              : 'Due: ${_formatDateOnly(dueDate)}',
                        ),
                      ),
                      TextButton(
                        onPressed: () async {
                          final picked = await showDatePicker(
                            context: context,
                            initialDate: DateTime.now(),
                            firstDate: DateTime(2000),
                            lastDate: DateTime(2100),
                          );
                          if (picked == null) return;
                          setDialogState(() {
                            dueDate = picked;
                          });
                        },
                        child: const Text('Pick date'),
                      ),
                    ],
                  ),
                  TextField(
                    controller: tagsController,
                    decoration: const InputDecoration(
                      labelText: 'Tags (comma-separated)',
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text('Create'),
              ),
            ],
          ),
        );
      },
    );

    if (saved != true) return;
    if (titleController.text.trim().isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Task title is required.')),
      );
      return;
    }

    try {
      await widget.repository.createTask(
        title: titleController.text,
        description: descriptionController.text,
        priority: priority,
        dueDate: dueDate == null ? null : _formatDateOnly(dueDate),
        tags: tagsController.text,
      );
      await _load();
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    }
  }

  Future<void> _updateStatus(PersonalTask task, String status) async {
    try {
      await widget.repository.updateTaskStatus(taskId: task.id, status: status);
      if (!mounted) return;
      setState(() {
        _tasks = _tasks
            .map(
              (item) =>
                  item.id == task.id ? item.copyWith(status: status) : item,
            )
            .toList();
      });
      await widget.pushNotificationsService.syncTaskDueReminders(_tasks);
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    }
  }

  Future<void> _deleteTask(PersonalTask task) async {
    try {
      await widget.repository.deleteTask(task.id);
      if (!mounted) return;
      setState(() {
        _tasks = _tasks.where((item) => item.id != task.id).toList();
      });
      await widget.pushNotificationsService.syncTaskDueReminders(_tasks);
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!),
            const SizedBox(height: 8),
            ElevatedButton(onPressed: _load, child: const Text('Retry')),
          ],
        ),
      );
    }

    final pending = _tasks.where((task) => task.status == 'pending').toList();
    final ongoing = _tasks.where((task) => task.status == 'ongoing').toList();
    final complete = _tasks.where((task) => task.status == 'complete').toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
          child: Row(
            children: [
              OutlinedButton.icon(
                onPressed: _createTask,
                icon: const Icon(Icons.add_task),
                label: const Text('New task'),
              ),
              const Spacer(),
              IconButton(
                onPressed: _load,
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _load,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
              children: [
                _buildTaskSection('Pending', pending),
                _buildTaskSection('Ongoing', ongoing),
                _buildTaskSection('Complete', complete),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildTaskSection(String title, List<PersonalTask> tasks) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ExpansionTile(
        title: Text('$title (${tasks.length})'),
        initiallyExpanded: true,
        children: tasks.isEmpty
            ? const [
                Padding(
                  padding: EdgeInsets.fromLTRB(16, 0, 16, 16),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text('No tasks.'),
                  ),
                ),
              ]
            : tasks.map(_buildTaskCard).toList(),
      ),
    );
  }

  Widget _buildTaskCard(PersonalTask task) {
    return ListTile(
      title: Text(task.title),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (task.description.isNotEmpty) Text(task.description),
          const SizedBox(height: 4),
          Text(
            '${task.priority} • ${task.dueDate ?? 'No due date'}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
      trailing: PopupMenuButton<String>(
        onSelected: (value) {
          if (value == 'delete') {
            _deleteTask(task);
            return;
          }
          _updateStatus(task, value);
        },
        itemBuilder: (_) => [
          const PopupMenuItem(value: 'pending', child: Text('Mark pending')),
          const PopupMenuItem(value: 'ongoing', child: Text('Mark ongoing')),
          const PopupMenuItem(value: 'complete', child: Text('Mark complete')),
          const PopupMenuDivider(),
          const PopupMenuItem(value: 'delete', child: Text('Delete')),
        ],
      ),
    );
  }
}

class _AssistantTab extends StatefulWidget {
  const _AssistantTab({required this.repository});

  final PersonalRepository repository;

  @override
  State<_AssistantTab> createState() => _AssistantTabState();
}

class _AssistantTabState extends State<_AssistantTab> {
  final TextEditingController _composerController = TextEditingController();

  bool _loading = true;
  bool _sending = false;
  String? _error;
  List<PersonalConversation> _conversations = <PersonalConversation>[];
  List<PersonalMessage> _messages = <PersonalMessage>[];
  String? _activeConversationId;
  String? _activeProposalId;
  String? _contextDocUuid;
  String? _contextDocTitle;
  bool _conversationsExpanded = true;

  @override
  void initState() {
    super.initState();
    _loadConversations();
  }

  @override
  void dispose() {
    _composerController.dispose();
    super.dispose();
  }

  Future<void> _loadConversations() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final conversations = await widget.repository.fetchConversations();
      if (!mounted) return;
      setState(() {
        _conversations = conversations;
        _activeConversationId = conversations.isEmpty
            ? null
            : (_activeConversationId ?? conversations.first.id);
      });
      await _loadMessages();
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Unable to load conversations.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _loadMessages() async {
    final conversationId = _activeConversationId;
    if (conversationId == null || conversationId.isEmpty) {
      setState(() {
        _messages = <PersonalMessage>[];
      });
      return;
    }
    try {
      final messages = await widget.repository.fetchMessages(conversationId);
      if (!mounted) return;
      setState(() {
        _messages = messages;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
      });
    }
  }

  Future<void> _createConversation() async {
    try {
      final conversation = await widget.repository.createConversation();
      if (!mounted) return;
      setState(() {
        _activeConversationId = conversation.id;
        _activeProposalId = null;
        _messages = <PersonalMessage>[];
      });
      await _loadConversations();
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    }
  }

  Future<void> _deleteConversation(PersonalConversation conversation) async {
    try {
      await widget.repository.deleteConversation(conversation.id);
      if (!mounted) return;
      setState(() {
        if (_activeConversationId == conversation.id) {
          _activeConversationId = null;
          _messages = <PersonalMessage>[];
          _activeProposalId = null;
        }
      });
      await _loadConversations();
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    }
  }

  Future<void> _selectConversation(PersonalConversation conversation) async {
    if (_activeConversationId == conversation.id) return;
    setState(() {
      _activeConversationId = conversation.id;
      _activeProposalId = null;
    });
    await _loadMessages();
  }

  Future<void> _sendMessage() async {
    final content = _composerController.text.trim();
    if (content.isEmpty || _sending) return;

    String conversationId = _activeConversationId ?? '';
    if (conversationId.isEmpty) {
      await _createConversation();
      conversationId = _activeConversationId ?? '';
      if (conversationId.isEmpty) return;
    }

    setState(() {
      _sending = true;
      _error = null;
    });
    _composerController.clear();

    try {
      final result = await widget.repository.sendMessage(
        conversationId: conversationId,
        content: content,
        contextDocUuid: _contextDocUuid,
      );
      if (!mounted) return;
      setState(() {
        _activeProposalId = result.proposalId;
      });
      await _loadMessages();
      await _loadConversations();
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Unable to send message.')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _sending = false;
        });
      }
    }
  }

  Future<void> _confirmProposal() async {
    final proposalId = _activeProposalId;
    if (proposalId == null || proposalId.isEmpty) return;
    try {
      await widget.repository.confirmProposal(proposalId);
      if (!mounted) return;
      setState(() {
        _activeProposalId = null;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Task proposal confirmed.')),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    }
  }

  Future<void> _rejectProposal() async {
    final proposalId = _activeProposalId;
    if (proposalId == null || proposalId.isEmpty) return;
    try {
      await widget.repository.rejectProposal(proposalId);
      if (!mounted) return;
      setState(() {
        _activeProposalId = null;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Task proposal rejected.')),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    }
  }

  Future<void> _pickContextDocument() async {
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
        final result = await widget.repository
            .fetchContextDocuments(searchController.text);
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

    await showDialog<void>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            if (!initialized &&
                loadingDocs &&
                docs.isEmpty &&
                localError == null) {
              initialized = true;
              // Trigger first fetch once.
              unawaited(loadDocs(setDialogState));
            }
            return AlertDialog(
              title: const Text('Select context document'),
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
                      height: 260,
                      child: docs.isEmpty
                          ? const Center(child: Text('No documents found.'))
                          : ListView.builder(
                              itemCount: docs.length,
                              itemBuilder: (context, index) {
                                final doc = docs[index];
                                return ListTile(
                                  title: Text(
                                    doc.title.isEmpty
                                        ? 'Untitled document'
                                        : doc.title,
                                  ),
                                  subtitle: Text(
                                    '${doc.course} • ${doc.subject}',
                                  ),
                                  onTap: () {
                                    setState(() {
                                      _contextDocUuid = doc.uuid;
                                      _contextDocTitle = doc.title;
                                    });
                                    Navigator.of(context).pop();
                                  },
                                );
                              },
                            ),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    setState(() {
                      _contextDocUuid = null;
                      _contextDocTitle = null;
                    });
                    Navigator.of(context).pop();
                  },
                  child: const Text('Clear'),
                ),
                TextButton(
                  onPressed: () => loadDocs(setDialogState),
                  child: const Text('Search'),
                ),
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Close'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Widget _buildConversationList() {
    if (_conversations.isEmpty) {
      return const Padding(
        padding: EdgeInsets.fromLTRB(12, 0, 12, 8),
        child: AppSectionCard(
          child: Text('No conversations yet.'),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
      child: AppSectionCard(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
        child: ExpansionTile(
          initiallyExpanded: _conversationsExpanded,
          onExpansionChanged: (expanded) {
            setState(() {
              _conversationsExpanded = expanded;
            });
          },
          title: Text('Conversations (${_conversations.length})'),
          children: _conversations.map((conversation) {
            final active = conversation.id == _activeConversationId;
            final title = conversation.title.trim().isEmpty
                ? 'New conversation'
                : conversation.title.trim();

            return ListTile(
              selected: active,
              selectedTileColor:
                  AppPalette.navIndicator.withValues(alpha: 0.45),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
              title: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
              subtitle: Text(
                _formatDateTime(conversation.updatedAt),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              onTap: () => _selectConversation(conversation),
              trailing: IconButton(
                onPressed: () => _deleteConversation(conversation),
                tooltip: 'Delete',
                icon: const Icon(Icons.delete_outline, size: 20),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: _loadConversations,
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
          child: Row(
            children: [
              OutlinedButton.icon(
                onPressed: _createConversation,
                icon: const Icon(Icons.add_comment_outlined),
                label: const Text('New'),
              ),
              const SizedBox(width: 8),
              OutlinedButton.icon(
                onPressed: _pickContextDocument,
                icon: const Icon(Icons.menu_book_outlined),
                label: const Text('Context'),
              ),
              const Spacer(),
              IconButton(
                onPressed: _loadConversations,
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
        ),
        if ((_contextDocTitle ?? '').isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: Row(
              children: [
                const Icon(Icons.link, size: 16),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'Context: $_contextDocTitle',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        _buildConversationList(),
        if (_activeProposalId != null && _activeProposalId!.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 6),
            child: Row(
              children: [
                ElevatedButton(
                  onPressed: _confirmProposal,
                  child: const Text('Confirm tasks'),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: _rejectProposal,
                  child: const Text('Reject'),
                ),
              ],
            ),
          ),
        Expanded(
          child: _messages.isEmpty
              ? const Center(child: Text('Start the conversation.'))
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                  itemCount: _messages.length,
                  itemBuilder: (context, index) {
                    final message = _messages[index];
                    final mine = message.role == 'user';
                    return Align(
                      alignment:
                          mine ? Alignment.centerRight : Alignment.centerLeft,
                      child: Container(
                        constraints: const BoxConstraints(maxWidth: 320),
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(10),
                          color: mine
                              ? Theme.of(context).colorScheme.primaryContainer
                              : Theme.of(context)
                                  .colorScheme
                                  .surfaceContainerHighest,
                        ),
                        child: Text(
                          message.content.isEmpty
                              ? '(empty message)'
                              : message.content,
                        ),
                      ),
                    );
                  },
                ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _composerController,
                    minLines: 1,
                    maxLines: 4,
                    decoration: const InputDecoration(
                      hintText: 'Ask your personal assistant...',
                    ),
                    onSubmitted: (_) => _sendMessage(),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  onPressed: _sending ? null : _sendMessage,
                  icon: _sending
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.send),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ProfileTab extends StatefulWidget {
  const _ProfileTab({required this.repository});

  final PersonalRepository repository;

  @override
  State<_ProfileTab> createState() => _ProfileTabState();
}

class _ProfileTabState extends State<_ProfileTab> {
  final _displayNameController = TextEditingController();
  final _bioController = TextEditingController();
  final _mainCourseController = TextEditingController();
  final _subCoursesController = TextEditingController();
  final _facebookController = TextEditingController();
  final _linkedinController = TextEditingController();
  final _instagramController = TextEditingController();
  final _githubController = TextEditingController();
  final _portfolioController = TextEditingController();

  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _photoLink;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _displayNameController.dispose();
    _bioController.dispose();
    _mainCourseController.dispose();
    _subCoursesController.dispose();
    _facebookController.dispose();
    _linkedinController.dispose();
    _instagramController.dispose();
    _githubController.dispose();
    _portfolioController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final profile = await widget.repository.fetchMyProfile();
      if (!mounted) return;
      _displayNameController.text = profile.displayName;
      _bioController.text = profile.bio;
      _mainCourseController.text = profile.mainCourse ?? '';
      _subCoursesController.text = profile.subCourses.join(', ');
      _facebookController.text = profile.facebook;
      _linkedinController.text = profile.linkedin;
      _instagramController.text = profile.instagram;
      _githubController.text = profile.github;
      _portfolioController.text = profile.portfolio;
      setState(() {
        _photoLink = profile.photoLink;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Unable to load profile.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _uploadPhoto() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.image,
        allowMultiple: false,
        withData: true,
      );
      if (result == null || result.files.isEmpty) return;
      final file = result.files.first;
      var bytes = file.bytes;
      if (bytes == null && file.path != null && file.path!.isNotEmpty) {
        bytes = await File(file.path!).readAsBytes();
      }
      if (bytes == null || bytes.isEmpty) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not read selected image.')),
        );
        return;
      }

      final link = await widget.repository.uploadProfilePhoto(
        bytes: bytes,
        filename: file.name,
      );
      if (!mounted) return;
      setState(() {
        _photoLink = link;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Profile photo updated.')),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Unable to upload profile photo.')),
      );
    }
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.repository.updateProfile(
        displayName: _displayNameController.text,
        bio: _bioController.text,
        mainCourse: _mainCourseController.text,
        subCourses: _subCoursesController.text,
        facebook: _facebookController.text,
        linkedin: _linkedinController.text,
        instagram: _instagramController.text,
        github: _githubController.text,
        portfolio: _portfolioController.text,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Profile updated.')),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Unable to update profile.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!),
            const SizedBox(height: 8),
            ElevatedButton(onPressed: _load, child: const Text('Retry')),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 16),
        children: [
          Center(
            child: Column(
              children: [
                CircleAvatar(
                  radius: 40,
                  backgroundImage: (_photoLink ?? '').isEmpty
                      ? null
                      : NetworkImage(_photoLink!),
                  child: (_photoLink ?? '').isEmpty
                      ? const Icon(Icons.person, size: 32)
                      : null,
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: _uploadPhoto,
                  icon: const Icon(Icons.photo_camera_outlined),
                  label: const Text('Change photo'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _displayNameController,
            decoration: const InputDecoration(labelText: 'Display name'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _bioController,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(labelText: 'Bio'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _mainCourseController,
            decoration: const InputDecoration(labelText: 'Main course'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _subCoursesController,
            decoration: const InputDecoration(
              labelText: 'Sub courses (comma-separated)',
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _facebookController,
            decoration: const InputDecoration(labelText: 'Facebook'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _linkedinController,
            decoration: const InputDecoration(labelText: 'LinkedIn'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _instagramController,
            decoration: const InputDecoration(labelText: 'Instagram'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _githubController,
            decoration: const InputDecoration(labelText: 'GitHub'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _portfolioController,
            decoration: const InputDecoration(labelText: 'Portfolio'),
          ),
          const SizedBox(height: 16),
          ElevatedButton.icon(
            onPressed: _saving ? null : _save,
            icon: const Icon(Icons.save_outlined),
            label: _saving
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Save profile'),
          ),
        ],
      ),
    );
  }
}

class _PeopleTab extends StatefulWidget {
  const _PeopleTab({required this.repository});

  final PersonalRepository repository;

  @override
  State<_PeopleTab> createState() => _PeopleTabState();
}

class _PeopleTabState extends State<_PeopleTab> {
  static const int _pageSize = 30;

  final _searchController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  Timer? _debounce;

  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = true;
  String? _error;
  int _page = 1;
  String _query = '';
  List<PersonSearchUser> _users = <PersonSearchUser>[];

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _load(refresh: true);
  }

  @override
  void dispose() {
    _debounce?.cancel();
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
    if (max - current < 220) {
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
      final nextPage = refresh ? 1 : _page;
      final users = await widget.repository.searchPeople(
        query: _query,
        page: nextPage,
        pageSize: _pageSize,
      );
      if (!mounted) return;
      setState(() {
        if (refresh) {
          _users = users;
        } else {
          final merged = <String, PersonSearchUser>{
            for (final user in _users) user.uid: user,
            for (final user in users) user.uid: user,
          };
          _users = merged.values.toList();
        }
        _hasMore = users.length >= _pageSize;
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
          _error = 'Unable to search users.';
        });
      } else {
        showAppSnackBar(context, 'Unable to load more users.', isError: true);
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
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (!mounted) return;
      setState(() {
        _query = value.trim();
      });
      _load(refresh: true);
    });
  }

  Future<void> _handleFollowAction(PersonSearchUser user) async {
    final relation = user.relation;
    final previous = relation;
    try {
      if (relation.isFollowing) {
        await widget.repository.unfollow(user.uid);
        _applyRelation(
          user.uid,
          relation.copyWith(isFollowing: false, followRequestSent: false),
        );
        return;
      }
      if (relation.followRequestSent) {
        await widget.repository.cancelFollowRequest(user.uid);
        _applyRelation(
          user.uid,
          relation.copyWith(followRequestSent: false, isFollowing: false),
        );
        return;
      }

      final next = await widget.repository.follow(user.uid);
      _applyRelation(
        user.uid,
        relation.copyWith(
          isFollowing: next.isFollowing,
          followRequestSent: next.followRequestSent,
        ),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      _applyRelation(user.uid, previous);
      showAppSnackBar(context, error.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      _applyRelation(user.uid, previous);
      showAppSnackBar(context, 'Unable to update follow status.',
          isError: true);
    }
  }

  void _applyRelation(String uid, PersonRelation relation) {
    if (!mounted) return;
    setState(() {
      _users = _users
          .map(
            (item) =>
                item.uid == uid ? item.copyWith(relation: relation) : item,
          )
          .toList();
    });
  }

  Future<void> _openUserProfile(PersonSearchUser user) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => _PersonProfileScreen(
          repository: widget.repository,
          user: user,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
          child: AppSectionCard(
            child: TextField(
              controller: _searchController,
              decoration: const InputDecoration(
                hintText: 'Search people by name/course',
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: _onSearchChanged,
            ),
          ),
        ),
        Expanded(child: _buildBody()),
      ],
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const AppLoadingState(label: 'Searching people...');
    }
    if (_error != null) {
      return AppErrorState(
          message: _error!, onRetry: () => _load(refresh: true));
    }
    if (_users.isEmpty) {
      return const AppEmptyState(
        message: 'No users found.',
        icon: Icons.people_outline,
      );
    }
    return RefreshIndicator(
      onRefresh: () => _load(refresh: true),
      child: ListView.builder(
        controller: _scrollController,
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
        itemCount: _users.length + 1,
        itemBuilder: (context, index) {
          if (index == _users.length) {
            return buildLoadMoreIndicator(_loadingMore);
          }
          final user = _users[index];
          final relation = user.relation;
          String actionLabel = 'Follow';
          if (relation.isFollowing) {
            actionLabel = 'Unfollow';
          } else if (relation.followRequestSent) {
            actionLabel = 'Cancel request';
          }

          return AppSectionCard(
            margin: const EdgeInsets.only(bottom: 10),
            child: ListTile(
              contentPadding: EdgeInsets.zero,
              onTap: () => _openUserProfile(user),
              leading: CircleAvatar(
                backgroundImage: (user.photoLink ?? '').isEmpty
                    ? null
                    : NetworkImage(user.photoLink!),
                child: (user.photoLink ?? '').isEmpty
                    ? const Icon(Icons.person)
                    : null,
              ),
              title: Text(user.displayName),
              subtitle: Text(
                [
                  if ((user.course ?? '').isNotEmpty) user.course!,
                  if ((user.bio ?? '').isNotEmpty) user.bio!,
                  if (relation.followRequestReceived) 'Requested to follow you',
                  if (relation.followsYou) 'Follows you',
                ].join(' • '),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppPalette.inkSoft,
                    ),
              ),
              trailing: OutlinedButton(
                onPressed: () => _handleFollowAction(user),
                child: Text(actionLabel),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _PersonProfileScreen extends StatefulWidget {
  const _PersonProfileScreen({
    required this.repository,
    required this.user,
  });

  final PersonalRepository repository;
  final PersonSearchUser user;

  @override
  State<_PersonProfileScreen> createState() => _PersonProfileScreenState();
}

class _PersonProfileScreenState extends State<_PersonProfileScreen> {
  bool _loading = true;
  String? _error;
  ProfileData? _profile;

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
      final profile =
          await widget.repository.fetchProfileByUid(widget.user.uid);
      if (!mounted) return;
      setState(() {
        _profile = profile;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Unable to load profile.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final fallbackName = widget.user.displayName.trim().isEmpty
        ? 'Profile'
        : widget.user.displayName.trim();
    final resolvedName = (_profile?.displayName ?? '').trim();

    return Scaffold(
      appBar: AppBar(
        title: Text(resolvedName.isEmpty ? fallbackName : resolvedName),
      ),
      body: AppPageBackground(
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const AppLoadingState(label: 'Loading profile...');
    }
    if (_error != null) {
      return AppErrorState(message: _error!, onRetry: _load);
    }

    final profile = _profile;
    if (profile == null) {
      return const AppEmptyState(
        message: 'Profile not available.',
        icon: Icons.person_off_outlined,
      );
    }

    final sections = <Widget>[
      Center(
        child: CircleAvatar(
          radius: 46,
          backgroundImage: (profile.photoLink ?? '').isEmpty
              ? null
              : NetworkImage(profile.photoLink!),
          child: (profile.photoLink ?? '').isEmpty
              ? const Icon(Icons.person, size: 38)
              : null,
        ),
      ),
      const SizedBox(height: 10),
      Text(
        profile.displayName.isEmpty
            ? widget.user.displayName
            : profile.displayName,
        style: Theme.of(context).textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w700,
            ),
      ),
      const SizedBox(height: 6),
      Text(
        profile.bio.isEmpty ? 'No bio provided.' : profile.bio,
        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: AppPalette.inkSoft,
            ),
      ),
      const SizedBox(height: 14),
      _buildField(
          'Main course', profile.mainCourse ?? widget.user.course ?? ''),
      _buildField('Sub courses', profile.subCourses.join(', ')),
      _buildField('Facebook', profile.facebook),
      _buildField('LinkedIn', profile.linkedin),
      _buildField('Instagram', profile.instagram),
      _buildField('GitHub', profile.github),
      _buildField('Portfolio', profile.portfolio),
    ];

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 14, 12, 16),
        children: [
          AppSectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: sections,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildField(String label, String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 96,
            child: Text(
              '$label:',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppPalette.inkSoft,
                    fontWeight: FontWeight.w600,
                  ),
            ),
          ),
          Expanded(
            child: Text(trimmed),
          ),
        ],
      ),
    );
  }
}

String _formatDateTime(DateTime? value) {
  if (value == null) return 'Unknown';
  final local = value.toLocal();
  final year = local.year.toString().padLeft(4, '0');
  final month = local.month.toString().padLeft(2, '0');
  final day = local.day.toString().padLeft(2, '0');
  final hour = local.hour.toString().padLeft(2, '0');
  final minute = local.minute.toString().padLeft(2, '0');
  return '$year-$month-$day $hour:$minute';
}

String _formatDateOnly(DateTime? value) {
  if (value == null) return '';
  final local = value.toLocal();
  final year = local.year.toString().padLeft(4, '0');
  final month = local.month.toString().padLeft(2, '0');
  final day = local.day.toString().padLeft(2, '0');
  return '$year-$month-$day';
}
