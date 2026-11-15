package com.rentacar.app.agentapi.model

enum class AgentReadOrWrite {
    READ,
    WRITE
}

enum class AgentOperationRisk {
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL
}

enum class AgentConfirmationPolicy {
    NONE,
    SOFT,
    HARD,
    CRITICAL
}

enum class AgentImplementationStatus {
    REGISTERED,
    IMPLEMENTED,
    EXECUTABLE,
    TESTED
}

enum class AgentExecutionTarget {
    ANDROID_LOCAL,
    CLOUD,
    AUTO
}

enum class AgentDataSource {
    LOCAL,
    CLOUD,
    MIXED,
    UNKNOWN
}

enum class AgentSyncStatus {
    SYNCED,
    PENDING_SYNC,
    STALE,
    CONFLICT,
    UNKNOWN,
    UNAVAILABLE
}

enum class AgentResultCompleteness {
    COMPLETE,
    PARTIAL,
    UNKNOWN,
    UNAVAILABLE
}

enum class AgentSideEffect {
    NONE,
    MUTATING
}

enum class AgentErrorCode {
    INVALID_REQUEST,
    INVALID_ARGUMENT,
    UNKNOWN_OPERATION,
    UNSUPPORTED_OPERATION,
    NOT_IMPLEMENTED,
    UNAUTHORIZED,
    FORBIDDEN,
    VALIDATION_FAILED,
    NOT_FOUND,
    CONFLICT,
    CONFIRMATION_REQUIRED,
    DEVICE_UNAVAILABLE,
    CLOUD_UNAVAILABLE,
    STALE_DATA,
    SYNC_PENDING,
    TIMEOUT,
    INTERNAL_ERROR,
    WRITE_DISABLED,
    EXECUTION_DISABLED,
    SQL_NOT_ALLOWED,
    ARBITRARY_METHOD_NOT_ALLOWED
}
