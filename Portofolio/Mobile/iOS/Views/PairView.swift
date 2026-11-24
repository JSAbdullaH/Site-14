import SwiftUI

struct PairView: View {
    @EnvironmentObject private var model: AppModel
    @State private var code = ""
    @State private var info: PairingInfo?
    @State private var name = ""
    @State private var error: String?
    @State private var busy = false
    @State private var scanning = false
    @FocusState private var codeFocused: Bool

    private var cleanCode: String? { PairingCode.normalize(code) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Image(systemName: "location.circle.fill")
                            .font(.system(size: 44))
                            .foregroundStyle(.tint)
                        Text("Connect to your company")
                            .font(.title2.bold())
                        Text("Your company uses SITE14 to record time on site. Once connected, this iPhone and your Apple Watch share your location while you work, even when the app is closed.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 6)
                }

                if let error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                    }
                }

                if let info {
                    confirm(info)
                } else {
                    enterCode
                }
            }
            .navigationTitle("SITE14")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $scanning) {
                ScannerSheet { text in
                    scanning = false
                    if let found = PairingCode.extract(from: text) {
                        code = PairingCode.pretty(found)
                        Task { await check(found) }
                    } else {
                        error = "That QR code is not a SITE14 pairing code."
                    }
                }
            }
            .onAppear(perform: takeIncoming)
            .onChange(of: model.incomingCode) { _, _ in takeIncoming() }
        }
    }

    private var enterCode: some View {
        Section {
            Button {
                error = nil
                scanning = true
            } label: {
                Label("Scan the QR code", systemImage: "qrcode.viewfinder")
                    .labelStyle(.titleAndIcon)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))

            TextField("XXXX-XXXX", text: $code)
                .font(.system(.title2, design: .monospaced).weight(.semibold))
                .multilineTextAlignment(.center)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .focused($codeFocused)
                .onChange(of: code) { _, value in
                    let raw = String(value.uppercased().filter { $0.isLetter || $0.isNumber }.prefix(8))
                    let pretty = PairingCode.pretty(raw)
                    if pretty != value { code = pretty }
                    error = nil
                }
                .submitLabel(.continue)
                .onSubmit { if let c = cleanCode { Task { await check(c) } } }

            Button {
                if let c = cleanCode { Task { await check(c) } }
            } label: {
                HStack {
                    if busy { ProgressView() }
                    Text("Continue")
                }
                .frame(maxWidth: .infinity)
            }
            .disabled(cleanCode == nil || busy)
        } header: {
            Text("Pairing code")
        } footer: {
            Text("Your manager shows the QR code and the code under Devices → Connect a device.")
        }
    }

    @ViewBuilder
    private func confirm(_ info: PairingInfo) -> some View {
        Section("Connecting to") {
            Label(info.companyName, systemImage: "building.2")
                .font(.headline)
            if let employee = info.employee {
                Label("Carried by \(employee.fullName)", systemImage: "person")
            }
            LabeledContent("This device", value: DeviceInfo.modelName)
        }

        if info.label == nil {
            Section {
                TextField("For example: Ahmed's iPhone", text: $name)
                    .textInputAutocapitalization(.words)
            } header: {
                Text("Name (optional)")
            }
        }

        Section {
            Button {
                Task { await connect() }
            } label: {
                HStack {
                    if busy { ProgressView().tint(.white) }
                    Text("Connect and share location")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(busy)
            .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))

            Button("Use a different code") {
                self.info = nil
                code = ""
                error = nil
            }
            .frame(maxWidth: .infinity)
        } footer: {
            Text("iOS will ask to use your location. Choose Allow While Using App, then Change to Always Allow when asked, so sharing continues with the app closed.")
        }
    }

    private func takeIncoming() {
        guard let incoming = model.incomingCode, !busy else { return }
        model.incomingCode = nil
        code = PairingCode.pretty(incoming)
        Task { await check(incoming) }
    }

    private func check(_ value: String) async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            info = try await model.lookup(code: value)
            codeFocused = false
        } catch {
            info = nil
            self.error = error.localizedDescription
        }
    }

    private func connect() async {
        guard let c = cleanCode else { return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            try await model.connect(code: c, name: name.trimmingCharacters(in: .whitespaces))
        } catch {
            self.error = error.localizedDescription
        }
    }
}
