import 'package:flutter/material.dart';

import '../../../core/ui/app_theme.dart';
import '../../../core/ui/app_ui.dart';
import 'session_controller.dart';

enum _AuthMode { signIn, signUp }

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    required this.controller,
    this.submitting = false,
  });

  final SessionController controller;
  final bool submitting;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _displayNameController = TextEditingController();
  final _usernameController = TextEditingController();
  final _courseController = TextEditingController();
  final _recoveryEmailController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  _AuthMode _mode = _AuthMode.signIn;
  bool _showPassword = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _displayNameController.dispose();
    _usernameController.dispose();
    _courseController.dispose();
    _recoveryEmailController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    if (_mode == _AuthMode.signIn) {
      await widget.controller.login(
        email: _emailController.text,
        password: _passwordController.text,
      );
      return;
    }

    final ok = await widget.controller.signup(
      email: _emailController.text,
      password: _passwordController.text,
      username: _usernameController.text,
      displayName: _displayNameController.text,
      course: _courseController.text,
      recoveryEmail: _recoveryEmailController.text,
    );

    if (!mounted || !ok) return;
    setState(() {
      _mode = _AuthMode.signIn;
      _passwordController.clear();
      _confirmPasswordController.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final errorMessage = widget.controller.errorMessage;
    final infoMessage = widget.controller.infoMessage;
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      body: AppPageBackground(
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 430),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Container(
                      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(24),
                        gradient: const LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            Color(0xFFF4F8FC),
                            Color(0xFFE8F0F7),
                          ],
                        ),
                        border: Border.all(color: AppPalette.outlineSoft),
                      ),
                      child: Column(
                        children: [
                          Container(
                            width: 58,
                            height: 58,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(999),
                              gradient: const LinearGradient(
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                                colors: [
                                  AppPalette.primary,
                                  AppPalette.accent,
                                ],
                              ),
                            ),
                            child: const Icon(
                              Icons.waving_hand_rounded,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            _mode == _AuthMode.signIn
                                ? 'MyBuddy Login'
                                : 'Create MyBuddy Account',
                            style: textTheme.headlineSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                              letterSpacing: -0.2,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'Soft, focused workspace for your daily academic flow.',
                            textAlign: TextAlign.center,
                            style: textTheme.bodyMedium?.copyWith(
                              color: AppPalette.inkSoft,
                              height: 1.45,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    AppSectionCard(
                      padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
                      child: Form(
                        key: _formKey,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            SegmentedButton<_AuthMode>(
                              segments: const [
                                ButtonSegment<_AuthMode>(
                                  value: _AuthMode.signIn,
                                  label: Text('Sign in'),
                                  icon: Icon(Icons.login),
                                ),
                                ButtonSegment<_AuthMode>(
                                  value: _AuthMode.signUp,
                                  label: Text('Sign up'),
                                  icon: Icon(Icons.person_add_alt_1),
                                ),
                              ],
                              selected: <_AuthMode>{_mode},
                              onSelectionChanged: widget.submitting
                                  ? null
                                  : (selection) {
                                      setState(() {
                                        _mode = selection.first;
                                      });
                                    },
                            ),
                            const SizedBox(height: 12),
                            if (_mode == _AuthMode.signUp) ...[
                              TextFormField(
                                controller: _displayNameController,
                                decoration: const InputDecoration(
                                  labelText: 'Display name (optional)',
                                  prefixIcon: Icon(Icons.badge_outlined),
                                ),
                              ),
                              const SizedBox(height: 12),
                              TextFormField(
                                controller: _usernameController,
                                decoration: const InputDecoration(
                                  labelText: 'Username (optional)',
                                  prefixIcon:
                                      Icon(Icons.alternate_email_outlined),
                                ),
                              ),
                              const SizedBox(height: 12),
                            ],
                            TextFormField(
                              controller: _emailController,
                              keyboardType: TextInputType.emailAddress,
                              decoration: const InputDecoration(
                                labelText: 'Email',
                                prefixIcon: Icon(Icons.alternate_email_rounded),
                              ),
                              validator: (value) {
                                final text = (value ?? '').trim();
                                if (text.isEmpty) {
                                  return 'Email is required.';
                                }
                                if (!text.contains('@')) {
                                  return 'Enter a valid email.';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _passwordController,
                              obscureText: !_showPassword,
                              decoration: InputDecoration(
                                labelText: 'Password',
                                prefixIcon:
                                    const Icon(Icons.lock_outline_rounded),
                                suffixIcon: IconButton(
                                  onPressed: () {
                                    setState(() {
                                      _showPassword = !_showPassword;
                                    });
                                  },
                                  icon: Icon(
                                    _showPassword
                                        ? Icons.visibility_off_outlined
                                        : Icons.visibility_outlined,
                                  ),
                                  tooltip: _showPassword
                                      ? 'Hide password'
                                      : 'Show password',
                                ),
                              ),
                              validator: (value) {
                                final text = value ?? '';
                                if (text.isEmpty) {
                                  return 'Password is required.';
                                }
                                if (_mode == _AuthMode.signUp &&
                                    text.length < 8) {
                                  return 'Use at least 8 characters.';
                                }
                                return null;
                              },
                            ),
                            if (_mode == _AuthMode.signUp) ...[
                              const SizedBox(height: 12),
                              TextFormField(
                                controller: _confirmPasswordController,
                                obscureText: !_showPassword,
                                decoration: const InputDecoration(
                                  labelText: 'Confirm password',
                                  prefixIcon:
                                      Icon(Icons.verified_user_outlined),
                                ),
                                validator: (value) {
                                  if (_mode != _AuthMode.signUp) {
                                    return null;
                                  }
                                  final confirm = value ?? '';
                                  if (confirm.isEmpty) {
                                    return 'Please confirm your password.';
                                  }
                                  if (confirm != _passwordController.text) {
                                    return 'Passwords do not match.';
                                  }
                                  return null;
                                },
                              ),
                              const SizedBox(height: 12),
                              TextFormField(
                                controller: _courseController,
                                decoration: const InputDecoration(
                                  labelText: 'Course (optional)',
                                  prefixIcon: Icon(Icons.school_outlined),
                                ),
                              ),
                              const SizedBox(height: 12),
                              TextFormField(
                                controller: _recoveryEmailController,
                                keyboardType: TextInputType.emailAddress,
                                decoration: const InputDecoration(
                                  labelText: 'Recovery email (optional)',
                                  prefixIcon:
                                      Icon(Icons.mark_email_read_outlined),
                                ),
                                validator: (value) {
                                  final text = (value ?? '').trim();
                                  if (text.isEmpty) {
                                    return null;
                                  }
                                  if (!text.contains('@')) {
                                    return 'Enter a valid recovery email.';
                                  }
                                  return null;
                                },
                              ),
                            ],
                            const SizedBox(height: 16),
                            SizedBox(
                              height: 46,
                              child: ElevatedButton(
                                onPressed: widget.submitting ? null : _submit,
                                child: widget.submitting
                                    ? const SizedBox(
                                        width: 18,
                                        height: 18,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: Colors.white,
                                        ),
                                      )
                                    : Text(
                                        _mode == _AuthMode.signIn
                                            ? 'Sign in'
                                            : 'Create account',
                                      ),
                              ),
                            ),
                            if (infoMessage != null &&
                                infoMessage.isNotEmpty) ...[
                              const SizedBox(height: 12),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 10,
                                ),
                                decoration: BoxDecoration(
                                  color: AppPalette.primary.withValues(alpha: 0.08),
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(
                                    color: AppPalette.primary.withValues(alpha: 0.2),
                                  ),
                                ),
                                child: Text(
                                  infoMessage,
                                  style: textTheme.bodySmall?.copyWith(
                                    color: AppPalette.primaryDeep,
                                  ),
                                ),
                              ),
                            ],
                            if (errorMessage != null &&
                                errorMessage.isNotEmpty) ...[
                              const SizedBox(height: 12),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 10,
                                ),
                                decoration: BoxDecoration(
                                  color: const Color(0x14B3261E),
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(
                                    color: const Color(0x36B3261E),
                                  ),
                                ),
                                child: Text(
                                  errorMessage,
                                  style: textTheme.bodySmall?.copyWith(
                                    color: Theme.of(context).colorScheme.error,
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
