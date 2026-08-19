package com.rentacar.app.mailbox

import javax.mail.Message
import javax.mail.Multipart
import javax.mail.Part

/**
 * Collects ALL text/html and text/plain parts from a MIME tree, including nested
 * multipart/alternative|mixed|related and message/rfc822.
 *
 * Images/logos/signatures are inventoried by metadata only unless [downloadBinaryPayloads]
 * is true. Presence of an image never stops HTML collection.
 */
object MailboxMimeExtractor {

    data class ExtractedBodies(
        val htmlParts: List<MailboxBodyPart>,
        val plainParts: List<MailboxBodyPart>,
        val inventory: List<MailboxBodyPart>,
        val inlineImages: List<MailboxInlineImageInfo>
    )

    fun extract(
        part: Part,
        downloadBinaryPayloads: Boolean = false,
        maxDepth: Int = 14
    ): ExtractedBodies {
        val htmlParts = mutableListOf<MailboxBodyPart>()
        val plainParts = mutableListOf<MailboxBodyPart>()
        val inventory = mutableListOf<MailboxBodyPart>()
        val inlineImages = mutableListOf<MailboxInlineImageInfo>()
        walk(
            part = part,
            downloadBinaryPayloads = downloadBinaryPayloads,
            maxDepth = maxDepth,
            depth = 0,
            path = "0",
            htmlParts = htmlParts,
            plainParts = plainParts,
            inventory = inventory,
            inlineImages = inlineImages
        )
        val cidRefs = htmlParts.flatMap { html ->
            Regex("""cid:([^"'>\s]+)""", RegexOption.IGNORE_CASE)
                .findAll(html.text.orEmpty())
                .map { it.groupValues[1].trim().removePrefix("<").removeSuffix(">") }
                .toList()
        }.map { it.lowercase() }.toSet()
        val linkedImages = inlineImages.map { img ->
            img.copy(referencedByHtmlCid = img.contentIdPresent && cidRefs.isNotEmpty())
        }
        return ExtractedBodies(htmlParts, plainParts, inventory, linkedImages)
    }

    private fun walk(
        part: Part,
        downloadBinaryPayloads: Boolean,
        maxDepth: Int,
        depth: Int,
        path: String,
        htmlParts: MutableList<MailboxBodyPart>,
        plainParts: MutableList<MailboxBodyPart>,
        inventory: MutableList<MailboxBodyPart>,
        inlineImages: MutableList<MailboxInlineImageInfo>
    ) {
        if (depth > maxDepth) return
        try {
            val mimeType = runCatching {
                part.contentType?.substringBefore(';')?.trim().orEmpty()
            }.getOrDefault("")
            val disposition = runCatching { part.disposition }.getOrNull()
            val contentId = runCatching { part.getHeader("Content-ID")?.firstOrNull() }.getOrNull()
            val fileName = runCatching { part.fileName }.getOrNull()

            when {
                part.isMimeType("text/html") -> {
                    val text = part.content?.toString()
                    val bp = MailboxBodyPart(
                        mimePath = path,
                        mimeType = mimeType.ifBlank { "text/html" },
                        disposition = disposition,
                        contentId = contentId,
                        fileName = fileName,
                        sizeBytes = text?.length?.toLong() ?: 0L,
                        text = text
                    )
                    htmlParts += bp
                    inventory += bp.copy(text = null)
                }
                part.isMimeType("text/plain") -> {
                    val text = part.content?.toString()
                    val bp = MailboxBodyPart(
                        mimePath = path,
                        mimeType = mimeType.ifBlank { "text/plain" },
                        disposition = disposition,
                        contentId = contentId,
                        fileName = fileName,
                        sizeBytes = text?.length?.toLong() ?: 0L,
                        text = text
                    )
                    plainParts += bp
                    inventory += bp.copy(text = null)
                }
                part.isMimeType("multipart/*") -> {
                    val mp = part.content as? Multipart ?: return
                    for (i in 0 until mp.count) {
                        // Never skip HTML / nested rfc822 just because a sibling is an attachment
                        // or this child has Content-Disposition: attachment.
                        walk(
                            part = mp.getBodyPart(i),
                            downloadBinaryPayloads = downloadBinaryPayloads,
                            maxDepth = maxDepth,
                            depth = depth + 1,
                            path = "$path/$i",
                            htmlParts = htmlParts,
                            plainParts = plainParts,
                            inventory = inventory,
                            inlineImages = inlineImages
                        )
                    }
                }
                part.isMimeType("image/*") -> {
                    val size = runCatching {
                        part.getHeader("Content-Length")?.firstOrNull()?.toLongOrNull()
                    }.getOrNull()?.takeIf { it > 0 }
                        ?: runCatching {
                            // IMAP BODYSTRUCTURE size — does not download the part body.
                            val s = part.size
                            if (s >= 0) s.toLong() else 0L
                        }.getOrDefault(0L)
                    val cid = contentId?.trim()?.removePrefix("<")?.removeSuffix(">")
                    inlineImages += MailboxInlineImageInfo(
                        mimeType = mimeType,
                        contentIdPresent = !cid.isNullOrBlank(),
                        referencedByHtmlCid = false,
                        fileNamePresent = !fileName.isNullOrBlank(),
                        sizeBytes = size.coerceAtLeast(0L)
                    )
                    inventory += MailboxBodyPart(
                        mimePath = path,
                        mimeType = mimeType,
                        disposition = disposition,
                        contentId = contentId,
                        fileName = fileName,
                        sizeBytes = size.coerceAtLeast(0L)
                    )
                    // Never call part.size / part.inputStream / part.content — those pull PNG/JPEG bytes.
                }
                part.isMimeType("message/rfc822") -> {
                    val nestedMsg = runCatching { part.content }.getOrNull().let { c ->
                        when (c) {
                            is Message -> c
                            is Part -> c
                            else -> null
                        }
                    }
                    if (nestedMsg != null) {
                        walk(
                            part = nestedMsg,
                            downloadBinaryPayloads = downloadBinaryPayloads,
                            maxDepth = maxDepth,
                            depth = depth + 1,
                            path = "$path/rfc822",
                            htmlParts = htmlParts,
                            plainParts = plainParts,
                            inventory = inventory,
                            inlineImages = inlineImages
                        )
                    }
                }
                else -> {
                    inventory += MailboxBodyPart(
                        mimePath = path,
                        mimeType = mimeType.ifBlank { "unknown" },
                        disposition = disposition,
                        contentId = contentId,
                        fileName = fileName,
                        sizeBytes = runCatching { part.size.toLong() }.getOrDefault(0L)
                    )
                }
            }
        } catch (_: Exception) {
        }
    }
}
