package com.rentacar.app.data.auth

/**
 * Primary role enum for user account types.
 * Users can have exactly one primary role.
 */
enum class PrimaryRole(val value: String, val displayName: String, val description: String) {
    BUYER("BUYER", "קונה", "אני רוצה לחפש רכב לקנייה"),
    SELLER("SELLER", "מוכר", "אני רוצה לפרסם רכב למכירה"),
    AGENT("AGENT", "סוכן", "אני סוכן - דורש אישור מנהל"),
    YARD("YARD", "מגרש/סוחר", "אני מגרש / סוחר רכב - דורש אישור מנהל");
    
    companion object {
        fun fromString(value: String?): PrimaryRole? {
            return values().find { it.value == value }
        }
        
        fun isPrivileged(role: PrimaryRole?): Boolean {
            return role == AGENT || role == YARD
        }
    }
}

