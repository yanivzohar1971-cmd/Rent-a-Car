package com.rentacar.app.data.auth

/**
 * Primary role enum for user account types.
 * Users can have exactly one primary role.
 * 
 * PRIVATE_USER is the default role for all users.
 * BUYER and SELLER are kept for backward compatibility but are deprecated.
 */
enum class PrimaryRole(val value: String, val displayName: String, val description: String) {
    PRIVATE_USER("PRIVATE_USER", "משתמש פרטי", "משתמש רגיל - יכול לקנות ולמכור"),
    AGENT("AGENT", "סוכן", "אני סוכן - דורש אישור מנהל"),
    YARD("YARD", "מגרש/סוחר", "אני מגרש / סוחר רכב - דורש אישור מנהל"),
    ADMIN("ADMIN", "מנהל", "מנהל מערכת - לא ניתן לבחירה עצמית"),
    // Legacy roles - kept for backward compatibility, not shown in UI
    BUYER("BUYER", "קונה", "אני רוצה לחפש רכב לקנייה"),
    SELLER("SELLER", "מוכר", "אני רוצה לפרסם רכב למכירה");
    
    companion object {
        fun fromString(value: String?): PrimaryRole? {
            return values().find { it.value == value }
        }
        
        fun isPrivileged(role: PrimaryRole?): Boolean {
            return role == AGENT || role == YARD || role == ADMIN
        }
        
        /**
         * Returns roles that can be selected by users during signup/role selection.
         * Excludes ADMIN (admin-only) and legacy BUYER/SELLER.
         */
        fun selectableRoles(): List<PrimaryRole> {
            return listOf(PRIVATE_USER, AGENT, YARD)
        }
        
        /**
         * Maps legacy BUYER/SELLER roles to PRIVATE_USER.
         */
        fun mapLegacyRole(legacyRole: String?): PrimaryRole {
            return when (legacyRole) {
                "BUYER", "SELLER" -> PRIVATE_USER
                "AGENT" -> AGENT
                "YARD" -> YARD
                else -> PRIVATE_USER // Default to PRIVATE_USER
            }
        }
    }
}

