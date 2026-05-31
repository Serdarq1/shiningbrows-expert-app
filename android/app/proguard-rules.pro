-keep class com.shiningbrowsacademy.experts.** { *; }

# Keep any JavaScript interface methods
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep WebView-related classes
-keepclassmembers class android.webkit.WebView {
    public *;
}

# Keep Kotlin coroutines (if used transitively)
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
