package com.rentacar.app.agentapi.registry

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.reflect.TypeToken
import com.rentacar.app.agentapi.model.AgentConfirmationPolicy
import com.rentacar.app.agentapi.model.AgentExecutionTarget
import com.rentacar.app.agentapi.model.AgentImplementationStatus
import com.rentacar.app.agentapi.model.AgentOperationDefinition
import com.rentacar.app.agentapi.model.AgentOperationRisk
import com.rentacar.app.agentapi.model.AgentReadOrWrite
import com.rentacar.app.agentapi.model.AgentSideEffect
import java.io.InputStreamReader
import java.nio.charset.StandardCharsets

data class OperationCatalogDocument(
    val apiVersion: String,
    val catalogVersion: String,
    val sourceDocument: String,
    val reconciliationNote: String?,
    val phase0SummaryClaim: CatalogTotals?,
    val reconciledTotals: CatalogTotals,
    val operations: List<AgentOperationDefinition>
)

data class CatalogTotals(
    val total: Int,
    val read: Int,
    val write: Int
)

object OperationCatalogLoader {
    private val gson = Gson()

    fun loadFromClasspath(
        resourcePath: String = GeneratedOperationCatalog.CLASSPATH_RESOURCE,
        classLoader: ClassLoader = OperationCatalogLoader::class.java.classLoader
    ): OperationCatalogDocument {
        val stream = classLoader.getResourceAsStream(resourcePath)
            ?: error("Missing Agent API catalog resource: $resourcePath")
        stream.use { input ->
            val root = gson.fromJson(InputStreamReader(input, StandardCharsets.UTF_8), JsonObject::class.java)
            return parseDocument(root)
        }
    }

    internal fun parseDocument(root: JsonObject): OperationCatalogDocument {
        val opsJson = root.getAsJsonArray("operations")
            ?: error("operations array required")
        val mapType = object : TypeToken<Map<String, Any?>>() {}.type
        val operations = opsJson.map { el ->
            val o = el.asJsonObject
            val inputSchema = gson.fromJson<Map<String, Any?>>(o.get("inputSchema"), mapType) ?: emptyMap()
            val outputSchema = gson.fromJson<Map<String, Any?>>(o.get("outputSchema"), mapType) ?: emptyMap()
            val permissions = o.getAsJsonArray("requiredPermissions")?.map { it.asString } ?: listOf("AUTHENTICATED")
            val targets = o.getAsJsonArray("executionTargets")?.map {
                AgentExecutionTarget.valueOf(it.asString)
            } ?: listOf(AgentExecutionTarget.ANDROID_LOCAL)

            AgentOperationDefinition(
                operationId = o.get("operationId").asString,
                module = o.get("module").asString,
                entity = o.get("entity")?.asString ?: o.get("module").asString,
                description = o.get("description").asString,
                actionName = o.get("actionName").asString,
                screen = o.get("screen").asString,
                readOrWrite = AgentReadOrWrite.valueOf(o.get("readOrWrite").asString),
                sourceFiles = o.get("sourceFiles").asString,
                localSupport = o.get("localSupport").asString,
                cloudSupport = o.get("cloudSupport").asString,
                requiredPermissions = permissions,
                risk = AgentOperationRisk.valueOf(o.get("risk").asString),
                confirmationPolicy = AgentConfirmationPolicy.valueOf(o.get("confirmationPolicy").asString),
                executionTargets = targets,
                syncConsiderations = o.get("syncConsiderations").asString,
                inputSchema = inputSchema,
                outputSchema = outputSchema,
                implementationStatus = AgentImplementationStatus.valueOf(o.get("implementationStatus").asString),
                executable = o.get("executable").asBoolean,
                sideEffect = AgentSideEffect.valueOf(o.get("sideEffect").asString),
                complexity = o.get("complexity").asString
            )
        }

        val reconciled = root.getAsJsonObject("reconciledTotals")
        val claim = root.getAsJsonObject("phase0SummaryClaim")
        return OperationCatalogDocument(
            apiVersion = root.get("apiVersion").asString,
            catalogVersion = root.get("catalogVersion").asString,
            sourceDocument = root.get("sourceDocument").asString,
            reconciliationNote = root.get("reconciliationNote")?.asString,
            phase0SummaryClaim = claim?.let {
                CatalogTotals(it.get("total").asInt, it.get("read").asInt, it.get("write").asInt)
            },
            reconciledTotals = CatalogTotals(
                total = reconciled.get("total").asInt,
                read = reconciled.get("read").asInt,
                write = reconciled.get("write").asInt
            ),
            operations = operations
        )
    }
}
