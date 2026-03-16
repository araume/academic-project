import 'package:flutter/material.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/ui/app_theme.dart';
import '../../../core/ui/app_ui.dart';
import '../data/preferences_models.dart';
import '../data/preferences_repository.dart';

class PreferencesScreen extends StatefulWidget {
  const PreferencesScreen({super.key, required this.repository});

  final PreferencesRepository repository;

  @override
  State<PreferencesScreen> createState() => _PreferencesScreenState();
}

class _PreferencesScreenState extends State<PreferencesScreen> {
  bool _loading = true;
  bool _saving = false;
  String? _error;
  PrivacySettings? _settings;

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
      final settings = await widget.repository.fetchPrivacySettings();
      if (!mounted) return;
      setState(() {
        _settings = settings;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Unable to load preferences.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  void _updateSettings(PrivacySettings Function(PrivacySettings) updater) {
    final current = _settings;
    if (current == null) return;
    setState(() {
      _settings = updater(current);
    });
  }

  Future<void> _save() async {
    final current = _settings;
    if (current == null || _saving) return;

    setState(() {
      _saving = true;
    });

    try {
      final updated = await widget.repository.updatePrivacySettings(current);
      if (!mounted) return;
      setState(() {
        _settings = updated;
      });
      showAppSnackBar(context, 'Preferences saved.');
    } on ApiException catch (error) {
      if (!mounted) return;
      showAppSnackBar(context, error.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(context, 'Failed to save preferences.', isError: true);
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
    return Scaffold(
      appBar: AppBar(
        title: const Text('Preferences'),
      ),
      body: AppPageBackground(
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const AppLoadingState(label: 'Loading preferences...');
    }

    if (_error != null && _settings == null) {
      return AppErrorState(message: _error!, onRetry: _load);
    }

    final settings = _settings;
    if (settings == null) {
      return AppErrorState(
        message: 'Preferences are unavailable.',
        onRetry: _load,
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 16),
        children: [
          AppSectionCard(
            child: Text(
              'Privacy',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
            ),
          ),
          const SizedBox(height: 8),
          _buildToggleCard(
            title: 'Searchable profile',
            subtitle: 'Allow others to find your profile in People search.',
            value: settings.searchable,
            onChanged: (value) => _updateSettings(
              (item) => item.copyWith(searchable: value),
            ),
          ),
          const SizedBox(height: 8),
          _buildToggleCard(
            title: 'Follow approval required',
            subtitle: 'Require approval before someone follows you.',
            value: settings.followApprovalRequired,
            onChanged: (value) => _updateSettings(
              (item) => item.copyWith(followApprovalRequired: value),
            ),
          ),
          const SizedBox(height: 8),
          _buildToggleCard(
            title: 'Show active status',
            subtitle: 'Display when you were recently active.',
            value: settings.activeVisible,
            onChanged: (value) => _updateSettings(
              (item) => item.copyWith(activeVisible: value),
            ),
          ),
          const SizedBox(height: 8),
          AppSectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Non-follower chat policy',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Control who can message you if they are not following you.',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppPalette.inkSoft,
                      ),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<NonFollowerChatPolicy>(
                  initialValue: settings.nonFollowerChatPolicy,
                  items: NonFollowerChatPolicy.values
                      .map(
                        (policy) => DropdownMenuItem<NonFollowerChatPolicy>(
                          value: policy,
                          child: Text(policy.label),
                        ),
                      )
                      .toList(),
                  onChanged: (value) {
                    if (value == null) return;
                    _updateSettings(
                      (item) => item.copyWith(nonFollowerChatPolicy: value),
                    );
                  },
                  decoration: const InputDecoration(
                    labelText: 'Chat policy',
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          AppSectionCard(
            child: Text(
              'Notifications',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
            ),
          ),
          const SizedBox(height: 8),
          _buildToggleCard(
            title: 'New posts from following',
            subtitle: 'Get alerts when people you follow post.',
            value: settings.notifyNewPostsFromFollowing,
            onChanged: (value) => _updateSettings(
              (item) => item.copyWith(notifyNewPostsFromFollowing: value),
            ),
          ),
          const SizedBox(height: 8),
          _buildToggleCard(
            title: 'Activity on your posts',
            subtitle: 'Get alerts for likes and comments on your posts.',
            value: settings.notifyPostActivity,
            onChanged: (value) => _updateSettings(
              (item) => item.copyWith(notifyPostActivity: value),
            ),
          ),
          const SizedBox(height: 8),
          _buildToggleCard(
            title: 'Activity on your documents',
            subtitle: 'Get alerts for actions on your library uploads.',
            value: settings.notifyDocumentActivity,
            onChanged: (value) => _updateSettings(
              (item) => item.copyWith(notifyDocumentActivity: value),
            ),
          ),
          const SizedBox(height: 14),
          SizedBox(
            height: 46,
            child: ElevatedButton.icon(
              onPressed: _saving ? null : _save,
              icon: _saving
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.save_outlined),
              label: Text(_saving ? 'Saving...' : 'Save preferences'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildToggleCard({
    required String title,
    required String subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return AppSectionCard(
      padding: EdgeInsets.zero,
      child: SwitchListTile.adaptive(
        value: value,
        onChanged: onChanged,
        title: Text(
          title,
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
        ),
        subtitle: Text(
          subtitle,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: AppPalette.inkSoft,
              ),
        ),
      ),
    );
  }
}
