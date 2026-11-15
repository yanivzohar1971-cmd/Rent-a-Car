package com.rentacar.app.agentdev

import com.rentacar.app.agentapi.gateway.LoopbackGatewayRouter
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * AGENT-101 (AgentDev only). Minimal HTTP/1.1 server bound to 127.0.0.1 ONLY.
 *
 * It owns no business logic: requests are parsed and handed to [LoopbackGatewayRouter], which
 * performs bearer-token auth and derives identity from the paired device token. One request per
 * connection (`Connection: close`). Reachable from a host machine only through
 * `adb forward tcp:<port> tcp:<port>`.
 *
 * Uses only `java.net` (works on Android and on the JVM unit-test classpath).
 */
class AgentDevLoopbackServer(
    private val router: LoopbackGatewayRouter,
    private val port: Int,
    private val workerThreads: Int = DEFAULT_WORKER_THREADS
) : AutoCloseable {
    @Volatile private var serverSocket: ServerSocket? = null
    private var executor: ExecutorService? = null

    val boundPort: Int
        get() = checkNotNull(serverSocket) { "Server not started" }.localPort

    val isRunning: Boolean
        get() = serverSocket?.isClosed == false

    @Synchronized
    fun start(): AgentDevLoopbackServer {
        if (serverSocket != null) return this
        // Never the wildcard address: bind explicitly to the IPv4 loopback address.
        val socket = ServerSocket(port, BACKLOG, InetAddress.getByAddress(LOOPBACK_BYTES))
        check(socket.inetAddress.isLoopbackAddress) { "AgentDev server must bind to loopback only" }
        val pool = Executors.newFixedThreadPool(workerThreads.coerceAtLeast(2)) { r ->
            Thread(r, "agentdev-gateway-worker").apply { isDaemon = true }
        }
        serverSocket = socket
        executor = pool
        Thread({
            while (!socket.isClosed) {
                val client = try {
                    socket.accept()
                } catch (_: IOException) {
                    break
                }
                try {
                    pool.execute { serve(client) }
                } catch (_: RuntimeException) {
                    runCatching { client.close() }
                }
            }
        }, "agentdev-gateway-accept").apply { isDaemon = true }.start()
        return this
    }

    @Synchronized
    fun stop() {
        runCatching { serverSocket?.close() }
        executor?.shutdownNow()
        serverSocket = null
        executor = null
    }

    override fun close() = stop()

    private fun serve(client: Socket) {
        client.use { socket ->
            try {
                socket.soTimeout = SOCKET_TIMEOUT_MS
                val input = BufferedInputStream(socket.getInputStream())
                val requestLine = readLine(input) ?: return
                val parts = requestLine.split(' ')
                if (parts.size < 2) return
                val headers = linkedMapOf<String, String>()
                while (true) {
                    val line = readLine(input) ?: break
                    if (line.isEmpty()) break
                    if (headers.size >= MAX_HEADERS) return
                    val idx = line.indexOf(':')
                    if (idx > 0) headers[line.substring(0, idx).trim()] = line.substring(idx + 1).trim()
                }
                val length = headers.entries.firstOrNull { it.key.equals("Content-Length", true) }
                    ?.value?.toIntOrNull() ?: 0
                if (length < 0 || length > LoopbackGatewayRouter.MAX_BODY_BYTES) {
                    write(socket, 413, "Payload Too Large", """{"success":false,"error":{"code":"INVALID_REQUEST","message":"Body too large"}}""")
                    return
                }
                val body = if (length > 0) String(readFully(input, length), Charsets.UTF_8) else ""
                val result = router.handle(parts[0], parts[1], headers, body)
                write(socket, result.status, reason(result.status), result.body, result.contentType)
            } catch (_: Exception) {
                // Dev server: drop the connection on malformed input / timeouts.
            }
        }
    }

    private fun write(
        socket: Socket,
        status: Int,
        reason: String,
        body: String,
        contentType: String = "application/json; charset=utf-8"
    ) {
        val bytes = body.toByteArray(Charsets.UTF_8)
        val head = "HTTP/1.1 $status $reason\r\n" +
            "Content-Type: $contentType\r\n" +
            "Content-Length: ${bytes.size}\r\n" +
            "Connection: close\r\n\r\n"
        socket.getOutputStream().apply {
            write(head.toByteArray(Charsets.ISO_8859_1))
            write(bytes)
            flush()
        }
    }

    private fun readFully(input: InputStream, length: Int): ByteArray {
        val buffer = ByteArray(length)
        var read = 0
        while (read < length) {
            val n = input.read(buffer, read, length - read)
            if (n < 0) throw IOException("Unexpected end of body")
            read += n
        }
        return buffer
    }

    private fun readLine(input: InputStream): String? {
        val buffer = ByteArrayOutputStream()
        while (true) {
            val b = input.read()
            if (b == -1) return if (buffer.size() == 0) null else buffer.toString(Charsets.ISO_8859_1.name())
            if (b == '\n'.code) break
            if (b != '\r'.code) buffer.write(b)
            if (buffer.size() > MAX_LINE_BYTES) throw IOException("Header line too long")
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
        413 -> "Payload Too Large"
        500 -> "Internal Server Error"
        else -> "Status"
    }

    companion object {
        const val HOST: String = "127.0.0.1"
        private val LOOPBACK_BYTES = byteArrayOf(127, 0, 0, 1)
        private const val BACKLOG = 16
        private const val DEFAULT_WORKER_THREADS = 4
        private const val SOCKET_TIMEOUT_MS = 10_000
        private const val MAX_HEADERS = 64
        private const val MAX_LINE_BYTES = 8 * 1024
    }
}
