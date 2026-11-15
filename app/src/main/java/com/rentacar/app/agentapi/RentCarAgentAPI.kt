package com.rentacar.app.agentapi

import android.content.Context
import com.rentacar.app.agentapi.customer.CustomerReadPort
import com.rentacar.app.agentapi.customer.RepositoryCustomerReadPort
import com.rentacar.app.agentapi.discovery.AgentCapabilityDiscovery
import com.rentacar.app.agentapi.execution.AndroidLocalCustomerReadExecutor
import com.rentacar.app.agentapi.execution.AndroidLocalReservationReadExecutor
import com.rentacar.app.agentapi.execution.AndroidLocalSupplierReadExecutor
import com.rentacar.app.agentapi.execution.DispatchingAgentOperationExecutor
import com.rentacar.app.agentapi.execution.AgentOperationExecutor
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResponse
import com.rentacar.app.agentapi.registry.AgentCapabilityRegistry
import com.rentacar.app.agentapi.reservation.RepositoryReservationReadPort
import com.rentacar.app.agentapi.reservation.ReservationReadPort
import com.rentacar.app.agentapi.supplier.RepositorySupplierReadPort
import com.rentacar.app.agentapi.supplier.SupplierReadPort
import com.rentacar.app.di.DatabaseModule

/**
 * Rent a Car Agent API entry point.
 *
 * Default construction keeps all operations disabled (safe for production UI paths).
 * Use the `forAndroidLocal*` factories for trusted local read boundaries.
 */
class RentCarAgentAPI private constructor(
    val registry: AgentCapabilityRegistry,
    val discovery: AgentCapabilityDiscovery,
    private val executor: AgentOperationExecutor,
    val wiredExecutableOperations: Set<String>
) {
    fun discover() = discovery.discoverAll()

    fun discover(operationId: String) = discovery.discover(operationId)

    fun execute(request: AgentRequest): AgentResponse = executor.execute(request)

    companion object {
        const val NAME: String = "RentCarAgentAPI"

        /** Safe default: discovery + disabled execution (no Room access). */
        fun createDisabled(
            registry: AgentCapabilityRegistry = AgentCapabilityRegistry.loadDefault()
        ): RentCarAgentAPI {
            val dispatcher = DispatchingAgentOperationExecutor(
                registry = registry,
                localSupplierReadExecutor = null,
                localReservationReadExecutor = null,
                localCustomerReadExecutor = null
            )
            return RentCarAgentAPI(
                registry = registry,
                discovery = AgentCapabilityDiscovery(registry, wiredExecutableIds = emptySet()),
                executor = dispatcher,
                wiredExecutableOperations = emptySet()
            )
        }

        /**
         * Trusted application-side boundary for AGENT-010 supplier local reads.
         * Do not expose to untrusted network callers.
         */
        fun forAndroidLocalSupplierReads(
            supplierReadPort: SupplierReadPort,
            registry: AgentCapabilityRegistry = AgentCapabilityRegistry.loadDefault()
        ): RentCarAgentAPI {
            val local = AndroidLocalSupplierReadExecutor(supplierReadPort)
            val dispatcher = DispatchingAgentOperationExecutor(
                registry = registry,
                localSupplierReadExecutor = local,
                localReservationReadExecutor = null,
                localCustomerReadExecutor = null
            )
            val wired = dispatcher.wiredLocalOperations
            return RentCarAgentAPI(
                registry = registry,
                discovery = AgentCapabilityDiscovery(registry, wiredExecutableIds = wired),
                executor = dispatcher,
                wiredExecutableOperations = wired
            )
        }

        fun forAndroidLocalSupplierReads(
            context: Context,
            registry: AgentCapabilityRegistry = AgentCapabilityRegistry.loadDefault()
        ): RentCarAgentAPI {
            val repo = DatabaseModule.supplierRepository(context.applicationContext)
            return forAndroidLocalSupplierReads(RepositorySupplierReadPort(repo), registry)
        }

        /**
         * Trusted application-side boundary for AGENT-012 reservation local reads.
         */
        fun forAndroidLocalReservationReads(
            reservationReadPort: ReservationReadPort,
            registry: AgentCapabilityRegistry = AgentCapabilityRegistry.loadDefault()
        ): RentCarAgentAPI {
            val local = AndroidLocalReservationReadExecutor(reservationReadPort)
            val dispatcher = DispatchingAgentOperationExecutor(
                registry = registry,
                localSupplierReadExecutor = null,
                localReservationReadExecutor = local,
                localCustomerReadExecutor = null
            )
            val wired = dispatcher.wiredLocalOperations
            return RentCarAgentAPI(
                registry = registry,
                discovery = AgentCapabilityDiscovery(registry, wiredExecutableIds = wired),
                executor = dispatcher,
                wiredExecutableOperations = wired
            )
        }

        fun forAndroidLocalReservationReads(
            context: Context,
            registry: AgentCapabilityRegistry = AgentCapabilityRegistry.loadDefault()
        ): RentCarAgentAPI {
            val repo = DatabaseModule.reservationRepository(context.applicationContext)
            return forAndroidLocalReservationReads(RepositoryReservationReadPort(repo), registry)
        }

        /**
         * Trusted application-side boundary for AGENT-013 customer local reads.
         */
        fun forAndroidLocalCustomerReads(
            customerReadPort: CustomerReadPort,
            registry: AgentCapabilityRegistry = AgentCapabilityRegistry.loadDefault()
        ): RentCarAgentAPI {
            val local = AndroidLocalCustomerReadExecutor(customerReadPort)
            val dispatcher = DispatchingAgentOperationExecutor(
                registry = registry,
                localSupplierReadExecutor = null,
                localReservationReadExecutor = null,
                localCustomerReadExecutor = local
            )
            val wired = dispatcher.wiredLocalOperations
            return RentCarAgentAPI(
                registry = registry,
                discovery = AgentCapabilityDiscovery(registry, wiredExecutableIds = wired),
                executor = dispatcher,
                wiredExecutableOperations = wired
            )
        }

        fun forAndroidLocalCustomerReads(
            context: Context,
            registry: AgentCapabilityRegistry = AgentCapabilityRegistry.loadDefault()
        ): RentCarAgentAPI {
            val repo = DatabaseModule.customerRepository(context.applicationContext)
            return forAndroidLocalCustomerReads(RepositoryCustomerReadPort(repo), registry)
        }

        /**
         * Trusted local reads for supplier + reservation + optional customer
         * (AGENT-010 + AGENT-012 + AGENT-013).
         *
         * Pass [customerReadPort] to enable customer.list / customer.get.
         */
        fun forAndroidLocalReads(
            supplierReadPort: SupplierReadPort,
            reservationReadPort: ReservationReadPort,
            customerReadPort: CustomerReadPort? = null,
            registry: AgentCapabilityRegistry = AgentCapabilityRegistry.loadDefault()
        ): RentCarAgentAPI {
            val supplierLocal = AndroidLocalSupplierReadExecutor(supplierReadPort)
            val reservationLocal = AndroidLocalReservationReadExecutor(reservationReadPort)
            val customerLocal = customerReadPort?.let { AndroidLocalCustomerReadExecutor(it) }
            val dispatcher = DispatchingAgentOperationExecutor(
                registry = registry,
                localSupplierReadExecutor = supplierLocal,
                localReservationReadExecutor = reservationLocal,
                localCustomerReadExecutor = customerLocal
            )
            val wired = dispatcher.wiredLocalOperations
            return RentCarAgentAPI(
                registry = registry,
                discovery = AgentCapabilityDiscovery(registry, wiredExecutableIds = wired),
                executor = dispatcher,
                wiredExecutableOperations = wired
            )
        }

        fun forAndroidLocalReads(
            context: Context,
            registry: AgentCapabilityRegistry = AgentCapabilityRegistry.loadDefault()
        ): RentCarAgentAPI {
            val app = context.applicationContext
            return forAndroidLocalReads(
                supplierReadPort = RepositorySupplierReadPort(DatabaseModule.supplierRepository(app)),
                reservationReadPort = RepositoryReservationReadPort(DatabaseModule.reservationRepository(app)),
                customerReadPort = RepositoryCustomerReadPort(DatabaseModule.customerRepository(app)),
                registry = registry
            )
        }
    }
}
