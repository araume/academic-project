import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'preferences_models.dart';

class PreferencesRepository {
  PreferencesRepository({required ApiClient apiClient})
      : _apiClient = apiClient;

  final ApiClient _apiClient;

  Future<PrivacySettings> fetchPrivacySettings() async {
    final response = await _apiClient.getJson('/api/preferences/privacy');
    final raw = response.data['settings'];
    if (raw is! Map<String, dynamic>) {
      throw ApiException(
        statusCode: response.statusCode,
        message: 'Invalid preferences response.',
      );
    }
    return PrivacySettings.fromJson(raw);
  }

  Future<PrivacySettings> updatePrivacySettings(
      PrivacySettings settings) async {
    final response = await _apiClient.patchJson(
      '/api/preferences/privacy',
      body: settings.toPatchPayload(),
    );
    final raw = response.data['settings'];
    if (raw is! Map<String, dynamic>) {
      throw ApiException(
        statusCode: response.statusCode,
        message: 'Invalid preferences response.',
      );
    }
    return PrivacySettings.fromJson(raw);
  }
}
