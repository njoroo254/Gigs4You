// lib/core/models/task.dart
class Task {
  final String id;
  final String title;
  final String? description;
  final String status;
  final String priority;
  final double? latitude;
  final double? longitude;
  final String? locationName;
  final DateTime? dueAt;
  final int xpReward;
  final List<String> photoUrls;
  final String? notes;

  Task({
    required this.id,
    required this.title,
    this.description,
    required this.status,
    required this.priority,
    this.latitude,
    this.longitude,
    this.locationName,
    this.dueAt,
    this.xpReward = 50,
    this.photoUrls = const [],
    this.notes,
  });

  factory Task.fromJson(Map<String, dynamic> j) => Task(
    id:           j['id'] ?? '',
    title:        j['title'] ?? '',
    description:  j['description'],
    status:       j['status'] ?? 'pending',
    priority:     j['priority'] ?? 'medium',
    latitude:     j['latitude'] != null ? double.tryParse(j['latitude'].toString()) : null,
    longitude:    j['longitude'] != null ? double.tryParse(j['longitude'].toString()) : null,
    locationName: j['locationName'],
    dueAt:        j['dueAt'] != null ? DateTime.tryParse(j['dueAt']) : null,
    xpReward:     j['xpReward'] ?? 50,
    photoUrls:    j['photoUrls'] != null ? List<String>.from(j['photoUrls']) : [],
    notes:        j['notes'],
  );

  bool get isPending    => status == 'pending';
  bool get isInProgress => status == 'in_progress';
  bool get isCompleted  => status == 'completed';
  bool get isFailed     => status == 'failed';

  bool get isHighPriority  => priority == 'high';
  bool get isMedPriority   => priority == 'medium';
}

// lib/core/models/agent.dart
class Agent {
  final String id;
  final String status;
  final double? lastLatitude;
  final double? lastLongitude;
  final int totalXp;
  final int level;
  final int currentStreak;
  final DateTime? checkedInAt;
  final Map<String, dynamic>? user;

  Agent({
    required this.id,
    required this.status,
    this.lastLatitude,
    this.lastLongitude,
    this.totalXp = 0,
    this.level = 1,
    this.currentStreak = 0,
    this.checkedInAt,
    this.user,
  });

  factory Agent.fromJson(Map<String, dynamic> j) => Agent(
    id:             j['id'] ?? '',
    status:         j['status'] ?? 'offline',
    lastLatitude:   j['lastLatitude'] != null ? double.tryParse(j['lastLatitude'].toString()) : null,
    lastLongitude:  j['lastLongitude'] != null ? double.tryParse(j['lastLongitude'].toString()) : null,
    totalXp:        j['totalXp'] ?? 0,
    level:          j['level'] ?? 1,
    currentStreak:  j['currentStreak'] ?? 0,
    checkedInAt:    j['checkedInAt'] != null ? DateTime.tryParse(j['checkedInAt']) : null,
    user:           j['user'],
  );

  bool get isCheckedIn => status == 'checked_in';
  String get name => user?['name'] ?? 'Agent';

  // XP needed for next level
  static const _thresholds = [0, 500, 1000, 2000, 3500, 5000, 7500, 10000];

  int get xpForCurrentLevel => level <= _thresholds.length ? _thresholds[level - 1] : 0;
  int get xpForNextLevel    => level < _thresholds.length  ? _thresholds[level]     : 99999;
  double get levelProgress  {
    final current = totalXp - xpForCurrentLevel;
    final needed  = xpForNextLevel - xpForCurrentLevel;
    return needed > 0 ? (current / needed).clamp(0.0, 1.0) : 1.0;
  }

  String get levelTitle {
    const titles = ['', 'Rookie', 'Field Agent', 'Field Star', 'Senior Agent', 'Elite', 'Champion', 'Legend'];
    return level < titles.length ? titles[level] : 'Legend';
  }
}
