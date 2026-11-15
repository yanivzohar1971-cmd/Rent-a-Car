package com.rentacar.app.agentapi.gateway

import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * DEVELOPMENT ONLY - JVM unit-test HTTP binding for [LoopbackGatewayRouter].
 *
 * Lives in the unit-test source set on purpose: it must never be started from
 * `Application.onCreate` or any production path. It binds to 127.0.0.1 only and uses
 * plain `java.net` sockets (`com.sun.net.httpserver` is not resolvable from the AGP
 * Kotlin unit-test compile classpath, and does not exist on Android anyway).
 *
 * Minimal HTTP/1.1: one request per connection (`Connection: close`).
 */
class LoopbackAgentGatewayServer(
    private val router: LoopbackGatewayRouter,
    private val port: Int = 0
) : AutoCloseable {
    private var serverSocket: ServerSocket? = null
    private var executor: ExecutorService? = null

    val boundPort: Int
        get() = checkNotNull(serverSocket) { "Server not started" }.localPort

    val baseUrl: String
        get() = "http://127.0.0.1:$boundPort"

    fun start(): LoopbackAgentGatewayServer {
        val socket = ServerSocket(port, 50, InetAddress.getLoopbackAddress())
        val pool = Executors.newCachedThreadPool { r -> Thread(r, "loopback-gateway").apply { isDaemon = true } }
        serverSocket = socket
        executor = pool
        pool.execute {
            while (!socket.isClosed) {
                val client = try {
                    socket.accept()
                } catch (_: Exception) {
                    break
                }
                pool.execute { serve(client) }
            }
        }
        return this
    }

    fun stop() {
        serverSocket?.close()
        executor?.shutdownNow()
        serverSocket = null
        executor = null
    }

    override fun close() = stop()

    private fun serve(client: Socket) {
        client.use { socket ->
            socket.soTimeout = 10_000
            try {
                val input = BufferedInputStream(socket.getInputStream())
                val requestLine = readLine(input) ?: return
                val parts = requestLine.split(' ')
                if (parts.size < 2) return
                val headers = linkedMapOf<String, String>()
                while (true) {
                    val line = readLine(input) ?: break
                    if (line.isEmpty()) break
                    val idx = line.indexOf(':')
                    if (idx > 0) headers[line.substring(0, idx).trim()] = line.substring(idx + 1).trim()
                }
                val length = headers.entries.firstOrNull { it.key.equals("Content-Length", true) }
                    ?.value?.toIntOrNull() ?: 0
                val body = if (length > 0) String(input.readNBytes(length), Charsets.UTF_8) else ""
                val result = router.handle(parts[0], parts[1], headers, body)
                val bytes = result.body.toByteArray(Charsets.UTF_8)
                val head = "HTTP/1.1 ${result.status} ${reason(result.status)}\r\n" +
                    "Content-Type: ${result.contentType}\r\n" +
                    "Content-Length: ${bytes.size}\r\n" +
                    "Connection: close\r\n\r\n"
                socket.getOutputStream().apply {
                    write(head.toByteArray(Charsets.ISO_8859_1))
                    write(bytes)
                    flush()
                }
            } catch (_: Exception) {
                // Dev server: drop the connection on malformed input.
            }
        }
    }

    private fun readLine(input: InputStream): String? {
        val buffer = ByteArrayOutputStream()
        while (true) {
            val b = input.read()
            if (b == -1) return if (buffer.size() == 0) null else buffer.toString(Charsets.ISO_8859_1.name())
            if (b == '\n'.code) break
            if (b != '\r'.code) buffer.write(b)
        }
        return buffer.toString(Charsets.ISO_8859_1.name())
    }

    private fun reason(status: Int) = when (status) {
        200 -> "OK"
        400 -> "Bad Request"
        401 -> "Unauthorized"
        403 -> "Forbidden"
        404 -> "Not Found"
        405 -> "Method Not Allowed"
        408 -> "Request Timeout"
        409 -> "Conflict"
        else -> "Status"
    }
}
