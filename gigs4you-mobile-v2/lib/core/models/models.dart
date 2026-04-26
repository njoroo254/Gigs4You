// ═══════════════════════════════════════════════════════
// CORE MODELS
// ═══════════════════════════════════════════════════════

class AppRoles {
  static const superAdmin = 'super_admin';
  static const admin      = 'admin';
  static const manager    = 'manager';
  static const supervisor = 'supervisor';
  static const agent      = 'agent';
  static const employer   = 'employer';

  static bool isManager(String role) =>
    [superAdmin, admin, manager, supervisor, employer].contains(role);

  // An agent is a confirmed team member — has tasks + can be GPS tracked
  static bool isAgent(String role) => role == agent || role == supervisor;

  // A worker is someone seeking employment — can see jobs, no tasks yet
  static bool isWorker(String role) => role == agent || role == employer;

  static bool canManageTasks(String role) =>
    [superAdmin, admin, manager, supervisor, employer].contains(role);

  static String displayName(String role) {
    switch (role) {
      case superAdmin:  return 'Super Admin';
      case admin:       return 'Admin';
      case manager:     return 'Manager';
      case supervisor:  return 'Supervisor';
      case employer:    return 'Employer';
      case agent:       return 'Field Agent';
      default:          return 'User';
    }
  }
}

class AppUser {
  final String id;
  final String name;
  final String phone;
  final String? email;
  final String role;
  final String? companyName;
  final String? county;
  final String? organisationId;
  final bool isActive;

  AppUser({
    required this.id, required this.name, required this.phone,
    this.email, required this.role, this.companyName,
    this.county, this.organisationId, this.isActive = true,
  });

  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
    id:             j['id'] ?? '',
    name:           j['name'] ?? '',
    phone:          j['phone'] ?? '',
    email:          j['email'],
    role:           j['role'] ?? 'agent',
    companyName:    j['companyName'],
    county:         j['county'],
    organisationId: j['organisationId'],
    isActive:       j['isActive'] ?? true,
  );

  bool get isManagerRole => AppRoles.isManager(role);
  bool get isAgentRole   => AppRoles.isAgent(role);
  bool get hasOrg        => organisationId != null && organisationId!.isNotEmpty;

  String get initials {
    final parts = name.trim().split(' ');
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    return name.isNotEmpty ? name[0].toUpperCase() : 'U';
  }

  String get roleDisplay => AppRoles.displayName(role);
}

class Skill {
  final String id;
  final String name;
  final String category;
  final int colorIndex;

  Skill({ required this.id, required this.name,
    required this.category, this.colorIndex = 0 });

  factory Skill.fromJson(Map<String, dynamic> j) => Skill(
    id:         j['id'] ?? '',
    name:       j['name'] ?? '',
    category:   j['category'] ?? 'general',
    colorIndex: j['colorIndex'] ?? 0,
  );
}

class Agent {
  final String id;
  final String status;
  final double? lastLatitude;
  final double? lastLongitude;
  final int totalXp;
  final int level;
  final int currentStreak;
  final DateTime? checkedInAt;
  final AppUser? user;
  final List<Skill> skills;
  final double? rating;
  final int completedJobs;
  final String? bio;
  final bool isAvailable;
  final String? organisationId;
  final bool isConfirmed; // true = active team member, false = pending invite

  Agent({
    required this.id, required this.status,
    this.lastLatitude, this.lastLongitude,
    this.totalXp = 0, this.level = 1,
    this.currentStreak = 0, this.checkedInAt,
    this.user, this.skills = const [],
    this.rating, this.completedJobs = 0,
    this.bio, this.isAvailable = true,
    this.organisationId, this.isConfirmed = true,
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
    user:           j['user'] != null ? AppUser.fromJson(j['user']) : null,
    rating:         j['averageRating'] != null ? double.tryParse(j['averageRating'].toString()) : null,
    completedJobs:  j['completedJobs'] ?? 0,
    bio:            j['bio'],
    isAvailable:    j['isAvailable'] ?? true,
    organisationId: j['organisationId'],
    isConfirmed:    j['isConfirmed'] ?? true,
    skills:         j['skills'] != null
        ? (j['skills'] as List).map((s) => Skill.fromJson(s)).toList()
        : [],
  );

  bool get isCheckedIn => status == 'checked_in';
  bool get isTeamMember => organisationId != null && isConfirmed;
  String get name    => user?.name ?? 'Agent';
  String get initials => user?.initials ?? 'A';

  static const _thresholds = [0, 500, 1000, 2000, 3500, 5000, 7500, 10000];
  int get xpForCurrentLevel => level <= _thresholds.length ? _thresholds[level - 1] : 0;
  int get xpForNextLevel    => level < _thresholds.length  ? _thresholds[level]     : 99999;
  double get levelProgress  {
    final current = totalXp - xpForCurrentLevel;
    final needed  = xpForNextLevel - xpForCurrentLevel;
    return needed > 0 ? (current / needed).clamp(0.0, 1.0) : 1.0;
  }
  static const _titles = ['','Rookie','Field Agent','Field Star','Senior Agent','Elite Pro','Champion','Legend'];
  String get levelTitle => level < _titles.length ? _titles[level] : 'Legend';
}

class ChecklistItem {
  final String id;
  final String label;
  final bool required;
  final bool checked;
  final bool requiresPhoto;
  final int requiredPhotoCount;
  final List<String> photoUrls; // photos uploaded for this checklist item

  const ChecklistItem({
    required this.id,
    required this.label,
    this.required = false,
    this.checked = false,
    this.requiresPhoto = false,
    this.requiredPhotoCount = 1,
    this.photoUrls = const [],
  });

  factory ChecklistItem.fromJson(Map<String, dynamic> j) => ChecklistItem(
    id:                 j['id']?.toString() ?? '',
    label:              j['label']?.toString() ?? '',
    required:           j['required'] as bool? ?? false,
    checked:            j['checked'] as bool? ?? false,
    requiresPhoto:      j['requiresPhoto'] as bool? ?? false,
    requiredPhotoCount: (j['requiredPhotoCount'] as num?)?.toInt() ?? 1,
    photoUrls:          j['photoUrls'] != null
        ? List<String>.from(j['photoUrls'] as List)
        : [],
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'label': label,
    'required': required,
    'checked': checked,
    if (checked) 'checkedAt': DateTime.now().toIso8601String(),
    'requiresPhoto': requiresPhoto,
    'requiredPhotoCount': requiredPhotoCount,
    'photoUrls': photoUrls,
  };

  ChecklistItem copyWith({bool? checked, List<String>? photoUrls}) => ChecklistItem(
    id: id, label: label, required: required,
    checked: checked ?? this.checked,
    requiresPhoto: requiresPhoto,
    requiredPhotoCount: requiredPhotoCount,
    photoUrls: photoUrls ?? this.photoUrls,
  );

  bool get photoRequirementMet =>
      !requiresPhoto || photoUrls.length >= requiredPhotoCount;
}

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
  final DateTime? startedAt;
  final DateTime? completedAt;
  final int xpReward;
  final List<String> photoUrls;
  final String? notes;
  final String? assignedBy;
  final String? agentId;
  final String? acceptanceStatus;
  final DateTime? acceptanceDeadline;
  final bool acceptanceOverdue;
  final List<ChecklistItem> checklist;
  final bool requiresPhoto;
  final bool requiresSignature;

  Task({
    required this.id, required this.title,
    this.description, required this.status, required this.priority,
    this.latitude, this.longitude, this.locationName,
    this.dueAt, this.startedAt, this.completedAt, this.xpReward = 50,
    this.photoUrls = const [], this.notes,
    this.assignedBy, this.agentId,
    this.acceptanceStatus = 'pending',
    this.acceptanceDeadline, this.acceptanceOverdue = false,
    this.checklist = const [],
    this.requiresPhoto = false,
    this.requiresSignature = false,
  });

  factory Task.fromJson(Map<String, dynamic> j) => Task(
    id:                 j['id'] ?? '',
    title:              j['title'] ?? '',
    description:        j['description'],
    status:             j['status'] ?? 'pending',
    priority:           j['priority'] ?? 'medium',
    latitude:           j['latitude'] != null ? double.tryParse(j['latitude'].toString()) : null,
    longitude:          j['longitude'] != null ? double.tryParse(j['longitude'].toString()) : null,
    locationName:       j['locationName'],
    dueAt:              j['dueAt'] != null ? DateTime.tryParse(j['dueAt']) : null,
    startedAt:          j['startedAt'] != null ? DateTime.tryParse(j['startedAt']) : null,
    completedAt:        j['completedAt'] != null ? DateTime.tryParse(j['completedAt']) : null,
    xpReward:           j['xpReward'] ?? 50,
    photoUrls:          j['photoUrls'] != null ? List<String>.from(j['photoUrls']) : [],
    notes:              j['notes'],
    assignedBy:         j['assignedBy'],
    agentId:            j['agentId'],
    acceptanceStatus:   j['acceptanceStatus'] ?? 'pending',
    acceptanceDeadline: j['acceptanceDeadline'] != null ? DateTime.tryParse(j['acceptanceDeadline']) : null,
    acceptanceOverdue:  j['acceptanceOverdue'] ?? false,
    checklist:          j['checklist'] != null
        ? (j['checklist'] as List).map((i) => ChecklistItem.fromJson(i as Map<String, dynamic>)).toList()
        : [],
    requiresPhoto:      j['requiresPhoto'] as bool? ?? false,
    requiresSignature:  j['requiresSignature'] as bool? ?? false,
  );

  bool get isPending      => status == 'pending';
  bool get isInProgress   => status == 'in_progress';
  bool get isCompleted    => status == 'completed';
  bool get isFailed       => status == 'failed';
  bool get isCancelled    => status == 'cancelled';
  bool get isActive       => isPending || isInProgress;
  bool get needsAcceptance => acceptanceStatus == 'pending' && isPending;
  bool get isAccepted     => acceptanceStatus == 'accepted';
  bool get hasChecklist   => checklist.isNotEmpty;
  int  get checklistTotal => checklist.length;
  int  get checklistDone  => checklist.where((i) => i.checked).length;
  bool get allRequiredChecked => !checklist.any((i) => i.required && !i.checked);

  bool get isOverdue =>
    dueAt != null && dueAt!.isBefore(DateTime.now()) && !isCompleted && !isCancelled;

  Duration? get timeToAccept {
    if (acceptanceDeadline == null) return null;
    final remaining = acceptanceDeadline!.difference(DateTime.now());
    return remaining.isNegative ? Duration.zero : remaining;
  }

  String get statusDisplay {
    switch (status) {
      case 'pending':     return 'Pending';
      case 'in_progress': return 'In Progress';
      case 'completed':   return 'Completed';
      case 'failed':      return 'Failed';
      case 'cancelled':   return 'Cancelled';
      default:            return status;
    }
  }
}

class Job {
  final String id;
  final String title;
  final String description;
  final String category;
  final List<String> requiredSkills;
  final double budgetMin;
  final double budgetMax;
  final String budgetType;
  final String location;
  final double? latitude;
  final double? longitude;
  final String status;
  final DateTime postedAt;
  final DateTime? deadline;
  final String postedBy;
  final String? postedByName;
  final int applicants;
  final bool isUrgent;

  Job({
    required this.id, required this.title, required this.description,
    required this.category, required this.requiredSkills,
    required this.budgetMin, required this.budgetMax, required this.budgetType,
    required this.location, this.latitude, this.longitude,
    required this.status, required this.postedAt,
    this.deadline, required this.postedBy, this.postedByName,
    this.applicants = 0, this.isUrgent = false,
  });

  factory Job.fromJson(Map<String, dynamic> j) => Job(
    id:             j['id'] ?? '',
    title:          j['title'] ?? '',
    description:    j['description'] ?? '',
    category:       j['category'] ?? 'general',
    requiredSkills: j['requiredSkills'] != null
        ? (j['requiredSkills'] as List).map((s) =>
            s is Map ? s['name']?.toString() ?? '' : s.toString()).toList()
        : [],
    budgetMin:      double.tryParse(j['budgetMin']?.toString() ?? '0') ?? 0,
    budgetMax:      double.tryParse(j['budgetMax']?.toString() ?? '0') ?? 0,
    budgetType:     j['budgetType'] ?? 'fixed',
    location:       j['location'] ?? '',
    latitude:       j['latitude'] != null ? double.tryParse(j['latitude'].toString()) : null,
    longitude:      j['longitude'] != null ? double.tryParse(j['longitude'].toString()) : null,
    status:         j['status'] ?? 'open',
    postedAt:       j['createdAt'] != null ? DateTime.tryParse(j['createdAt']) ?? DateTime.now() : DateTime.now(),
    deadline:       j['deadline'] != null ? DateTime.tryParse(j['deadline']) : null,
    postedBy:       j['postedById'] ?? '',
    postedByName:   j['companyName'] ?? j['postedByName'],
    applicants:     j['applicantCount'] ?? j['applicants'] ?? 0,
    isUrgent:       j['isUrgent'] ?? false,
  );

  String get budgetDisplay {
    final min = 'KES ${budgetMin.toStringAsFixed(0)}';
    if (budgetMax > budgetMin) return '$min–${budgetMax.toStringAsFixed(0)}';
    return min;
  }
}

class WalletTransaction {
  final String id;
  final String type;
  final double amount;
  final String description;
  final DateTime createdAt;
  final String status;

  WalletTransaction({
    required this.id, required this.type, required this.amount,
    required this.description, required this.createdAt, required this.status,
  });

  factory WalletTransaction.fromJson(Map<String, dynamic> j) => WalletTransaction(
    id:          j['id'] ?? '',
    type:        j['type'] ?? 'credit',
    amount:      double.tryParse(j['amount']?.toString() ?? '0') ?? 0,
    description: j['description'] ?? '',
    createdAt:   j['createdAt'] != null ? DateTime.tryParse(j['createdAt']) ?? DateTime.now() : DateTime.now(),
    status:      j['status'] ?? 'completed',
  );

  bool get isCredit  => type == 'credit';
  bool get isPending => status == 'pending';
}

class AppNotification {
  final String id;
  final String title;
  final String body;
  final String type;
  final bool isRead;
  final DateTime createdAt;
  final String? actionId;

  AppNotification({
    required this.id, required this.title, required this.body,
    required this.type, this.isRead = false,
    required this.createdAt, this.actionId,
  });

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
    id:        j['id'] ?? '',
    title:     j['title'] ?? '',
    body:      j['body'] ?? '',
    type:      j['type'] ?? 'system',
    isRead:    j['isRead'] ?? false,
    createdAt: j['createdAt'] != null ? DateTime.tryParse(j['createdAt']) ?? DateTime.now() : DateTime.now(),
    actionId:  j['actionId'],
  );
}
