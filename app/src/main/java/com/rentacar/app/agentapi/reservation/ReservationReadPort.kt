package com.rentacar.app.agentapi.reservation

import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationRepository
import kotlinx.coroutines.flow.first

/**
 * Read-only port over the existing reservation repository.
 * Keeps Agent API free of Room/DAO coupling while reusing production data access.
 *
 * Implementations must enforce the caller's UID / account scope — never return
 * cross-user rows.
 */
interface ReservationReadPort {
    suspend fun listForUser(userUid: String): List<Reservation>
    suspend fun getByIdForUser(id: Long, userUid: String): Reservation?
}

/**
 * Repository-backed [ReservationReadPort] using existing Room UID scoping
 * (`ReservationDao.getAll` / `getById`).
 */
class RepositoryReservationReadPort(
    private val repository: ReservationRepository
) : ReservationReadPort {
    override suspend fun listForUser(userUid: String): List<Reservation> =
        repository.getAllReservationsForUser(userUid).first()

    override suspend fun getByIdForUser(id: Long, userUid: String): Reservation? =
        repository.getReservationForUser(id, userUid).first()
}
