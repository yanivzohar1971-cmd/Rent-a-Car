package com.rentacar.app.data.auth

/**
 * Centralized role resolver for user permissions and capabilities.
 * 
 * This helper provides a single source of truth for role-based checks throughout the app.
 * It safely handles legacy users who may not have the new role fields set.
 * 
 * Usage:
 * ```
 * val profile = authViewModel.uiState.value.currentUser
 * if (profile != null && UserRoleResolver.isAgent(profile)) {
 *     // Show agent-only UI
 * }
 * ```
 */
object UserRoleResolver {
    
    /**
     * Checks if the user is an agent.
     * For legacy users, falls back to checking the `role` field.
     */
    fun isAgent(profile: UserProfile?): Boolean {
        if (profile == null) return false
        // New field takes precedence, but check legacy role field for backward compatibility
        return profile.isAgent || profile.role == "AGENT"
    }
    
    /**
     * Checks if the user is a yard/dealer.
     */
    fun isYard(profile: UserProfile?): Boolean {
        if (profile == null) return false
        return profile.isYard
    }
    
    /**
     * Checks if the user can buy (search for cars to purchase).
     */
    fun canBuy(profile: UserProfile?): Boolean {
        if (profile == null) return false
        return profile.canBuy
    }
    
    /**
     * Checks if the user can sell (post cars for sale).
     */
    fun canSell(profile: UserProfile?): Boolean {
        if (profile == null) return false
        return profile.canSell
    }
    
    /**
     * Checks if the user is a private user (buyer or seller, not agent/yard).
     */
    fun isPrivateUser(profile: UserProfile?): Boolean {
        if (profile == null) return false
        // Re-derive from capabilities if needed
        return profile.isPrivateUser || (profile.canBuy || profile.canSell)
    }
    
    /**
     * Checks if the user has any business role (agent or yard).
     */
    fun isBusinessUser(profile: UserProfile?): Boolean {
        if (profile == null) return false
        return isAgent(profile) || isYard(profile)
    }
    
    /**
     * Checks if the user's account is active (not pending approval or suspended).
     */
    fun isActive(profile: UserProfile?): Boolean {
        if (profile == null) return false
        return profile.status == "ACTIVE"
    }
    
    /**
     * Checks if the user's account is pending approval.
     */
    fun isPendingApproval(profile: UserProfile?): Boolean {
        if (profile == null) return false
        return profile.status == "PENDING_APPROVAL"
    }
    
    /**
     * Gets a list of all roles/capabilities the user has.
     * Useful for debugging or displaying user capabilities.
     */
    fun getRoles(profile: UserProfile?): List<String> {
        if (profile == null) return emptyList()
        val roles = mutableListOf<String>()
        if (isAgent(profile)) roles.add("AGENT")
        if (isYard(profile)) roles.add("YARD")
        if (canBuy(profile)) roles.add("BUYER")
        if (canSell(profile)) roles.add("SELLER")
        if (roles.isEmpty()) roles.add("USER") // Default role if nothing else
        return roles
    }
    
    /**
     * Checks if the user has at least one of the specified roles.
     * Useful for gating features that require multiple possible roles.
     */
    fun hasAnyRole(profile: UserProfile?, vararg roles: String): Boolean {
        if (profile == null) return false
        return roles.any { role ->
            when (role.uppercase()) {
                "AGENT" -> isAgent(profile)
                "YARD" -> isYard(profile)
                "BUYER" -> canBuy(profile)
                "SELLER" -> canSell(profile)
                "PRIVATE_USER" -> isPrivateUser(profile)
                "BUSINESS_USER" -> isBusinessUser(profile)
                else -> false
            }
        }
    }
}

