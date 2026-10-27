import { File, Paths } from "expo-file-system";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Button, ScrollView, StyleSheet, Text, View } from "react-native";

// The simulator reaches the Mac's localhost. On a device, use the Mac's LAN address.
const UPLOAD_URL = "http://localhost:4321/upload";
const SIZE = 8 * 1024 * 1024;

type Row = { n: number; type: string; bytesSent: string; totalBytes: string };

export default function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState("idle");

  const upload = async (sessionType: "foreground" | "background") => {
    setRows([]);
    setStatus("writing test file");
    const file = new File(Paths.cache, "upload-test.bin");
    if (file.exists) file.delete();
    const bytes = new Uint8Array(SIZE);
    for (let i = 0; i < SIZE; i++) bytes[i] = (Math.random() * 256) | 0;
    file.write(bytes);

    let n = 0;
    setStatus(`uploading ${String(file.size)} bytes, ${sessionType} session`);
    try {
      const result = await file.upload(UPLOAD_URL, {
        httpMethod: "PUT",
        sessionType,
        // Logged as-is: no arithmetic on the values, so a bigint doesn't throw here.
        onProgress: ({ bytesSent, totalBytes }) => {
          n += 1;
          const row: Row = {
            n,
            type: typeof bytesSent,
            bytesSent: String(bytesSent),
            totalBytes: String(totalBytes),
          };
          setRows((r) => [...r, row]);
        },
      });
      setStatus(`done (${sessionType}): HTTP ${result.status}, ${n} progress call(s)`);
    } catch (e) {
      setStatus(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>expo-file-system File.upload progress</Text>
      <Text testID="build">{__DEV__ ? "Debug build (__DEV__)" : "Release build"}</Text>
      <Button title="Upload 8 MB (foreground session)" onPress={() => upload("foreground")} />
      <Button title="Upload 8 MB (background session, the default)" onPress={() => upload("background")} />
      <Text testID="status" style={styles.status}>
        {status}
      </Text>
      <ScrollView style={styles.list}>
        {rows.map((r) => (
          <Text key={r.n} style={styles.row}>
            #{r.n} typeof={r.type} {r.bytesSent}/{r.totalBytes}
          </Text>
        ))}
      </ScrollView>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 80, paddingHorizontal: 16, gap: 12, backgroundColor: "#fff" },
  title: { fontSize: 18, fontWeight: "600" },
  status: { fontWeight: "600" },
  list: { flex: 1 },
  row: { fontFamily: "Menlo", fontSize: 12, paddingVertical: 2 },
});
