package cloud.projectsolar.jarvis.assist

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.graphics.Path
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * The heart of JARVIS phone control. Once the user enables this Accessibility service (one toggle), JARVIS
 * can act for her: TYPE into the focused field, TAP / SWIPE anywhere, press HOME/BACK/RECENTS, open her
 * apps, and read the screen. It long-polls the JARVIS bridge for commands and runs them, then acks the
 * result. This is the same, sanctioned mechanism assistive tools (and AnyDesk/TeamViewer) use.
 */
class JarvisAccessibilityService : AccessibilityService() {

    @Volatile private var running = false
    private var since = 0L

    override fun onServiceConnected() {
        super.onServiceConnected()
        Store.serviceEnabled = true
        startLoop()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) { /* command-driven; we don't watch events */ }
    override fun onInterrupt() {}

    override fun onUnbind(intent: Intent?): Boolean {
        running = false
        Store.serviceEnabled = false
        return super.onUnbind(intent)
    }

    private fun startLoop() {
        if (running) return
        running = true
        thread(name = "jarvis-cmd-loop", isDaemon = true) {
            val deviceId = Store.deviceId(this)
            while (running) {
                try {
                    Bridge.register(this, deviceId)
                    val res = Bridge.poll(this, deviceId, since)
                    val cmds = res.optJSONArray("cmds")
                    if (cmds != null) {
                        for (i in 0 until cmds.length()) {
                            val c = cmds.getJSONObject(i)
                            since = maxOf(since, c.optLong("id"))
                            val (ok, detail) = runCommand(c)
                            Bridge.ack(this, deviceId, c.optLong("id"), ok, detail)
                        }
                    }
                } catch (_: Throwable) { /* keep polling; the lifeline must never die on a hiccup */ }
                try { Thread.sleep(if (running) 1500 else 0) } catch (_: InterruptedException) {}
            }
        }
    }

    /** Execute one command. Returns (ok, detail). */
    private fun runCommand(c: JSONObject): Pair<Boolean, String> {
        val type = c.optString("type")
        val p = c.optJSONObject("payload") ?: JSONObject()
        return when (type) {
            "type"  -> setFocusedText(p.optString("text"))
            "tap"   -> tap(p.optDouble("x", -1.0).toFloat(), p.optDouble("y", -1.0).toFloat())
            "swipe" -> swipe(p.optDouble("x1").toFloat(), p.optDouble("y1").toFloat(),
                             p.optDouble("x2").toFloat(), p.optDouble("y2").toFloat(),
                             p.optLong("ms", 300))
            "home"  -> Pair(performGlobalAction(GLOBAL_ACTION_HOME), "home")
            "back"  -> Pair(performGlobalAction(GLOBAL_ACTION_BACK), "back")
            "recents" -> Pair(performGlobalAction(GLOBAL_ACTION_RECENTS), "recents")
            "notifications" -> Pair(performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS), "notifications")
            "open"  -> openApp(p.optString("package"))
            else    -> Pair(false, "unknown command: $type")
        }
    }

    /** Type text into whatever field currently has focus (the standard accessibility way to type). */
    private fun setFocusedText(text: String): Pair<Boolean, String> {
        val node = findFocusedEditable() ?: return Pair(false, "no text field focused")
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        val ok = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        node.recycle()
        return Pair(ok, if (ok) "typed ${text.length} chars" else "set-text failed")
    }

    private fun findFocusedEditable(): AccessibilityNodeInfo? {
        findFocus(AccessibilityNodeInfo.FOCUS_INPUT)?.let { if (it.isEditable) return it }
        val root = rootInActiveWindow ?: return null
        return firstEditable(root)
    }

    private fun firstEditable(n: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (n == null) return null
        if (n.isEditable && n.isVisibleToUser) return n
        for (i in 0 until n.childCount) {
            val r = firstEditable(n.getChild(i))
            if (r != null) return r
        }
        return null
    }

    private fun tap(x: Float, y: Float): Pair<Boolean, String> {
        if (x < 0 || y < 0) return Pair(false, "bad coords")
        val path = Path().apply { moveTo(x, y) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 60)).build()
        val ok = dispatchGesture(gesture, null, null)
        return Pair(ok, "tap $x,$y")
    }

    private fun swipe(x1: Float, y1: Float, x2: Float, y2: Float, ms: Long): Pair<Boolean, String> {
        val path = Path().apply { moveTo(x1, y1); lineTo(x2, y2) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, ms.coerceIn(50, 3000))).build()
        return Pair(dispatchGesture(gesture, null, null), "swipe")
    }

    private fun openApp(pkg: String): Pair<Boolean, String> {
        if (pkg.isBlank()) return Pair(false, "no package")
        val intent = packageManager.getLaunchIntentForPackage(pkg)
            ?: return Pair(false, "app not found: $pkg")
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(intent)
        return Pair(true, "opened $pkg")
    }
}
