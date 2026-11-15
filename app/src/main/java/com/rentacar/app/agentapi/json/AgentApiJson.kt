package com.rentacar.app.agentapi.json

import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.rentacar.app.agentapi.model.AgentError
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResponse

object AgentApiJson {
    val gson: Gson = GsonBuilder()
        .serializeNulls()
        .create()

    fun toJson(request: AgentRequest): String = gson.toJson(request)
    fun requestFromJson(json: String): AgentRequest =
        gson.fromJson(json, AgentRequest::class.java)

    fun toJson(response: AgentResponse): String = gson.toJson(response)
    fun responseFromJson(json: String): AgentResponse =
        gson.fromJson(json, AgentResponse::class.java)

    fun toJson(error: AgentError): String = gson.toJson(error)
    fun errorFromJson(json: String): AgentError =
        gson.fromJson(json, AgentError::class.java)
}
