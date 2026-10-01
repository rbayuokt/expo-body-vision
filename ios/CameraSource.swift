import AVFoundation
import UIKit

protocol CameraSourceDelegate: AnyObject {
  /// Video queue. Inference runs inline: while it does, AVFoundation discards late frames.
  func camera(_ camera: CameraSource, didOutput buffer: CMSampleBuffer)
  /// Video queue.
  func cameraDidDropFrame(_ camera: CameraSource)
  /// Any queue.
  func camera(_ camera: CameraSource, didFail code: BodyVisionErrorCode, message: String)
  /// Session queue, whenever the input changes.
  func camera(_ camera: CameraSource, hasTorch: Bool)
}

/**
 Owns the capture session. Buffers are rotated upright on the connection and never mirrored,
 so analysis always sees an upright, un-mirrored image. Only the preview layer mirrors.
 */
final class CameraSource: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  let session = AVCaptureSession()
  weak var previewLayer: AVCaptureVideoPreviewLayer?
  weak var delegate: CameraSourceDelegate?

  private let sessionQueue = DispatchQueue(label: "expo.modules.bodyvision.session")
  let videoQueue = DispatchQueue(label: "expo.modules.bodyvision.video", qos: .userInitiated)
  private let videoOutput = AVCaptureVideoDataOutput()

  // Session queue.
  private var front = true
  private var torch = false
  private var wanted = false
  private var visible = false
  private var inBackground = false
  private var orientation: UIInterfaceOrientation = .portrait
  private var input: AVCaptureDeviceInput?
  private var outputAdded = false
  private var reportedDenied = false

  override init() {
    super.init()
    let center = NotificationCenter.default
    center.addObserver(self, selector: #selector(didEnterBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
    center.addObserver(self, selector: #selector(willEnterForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
    center.addObserver(self, selector: #selector(sessionInterrupted(_:)), name: .AVCaptureSessionWasInterrupted, object: session)
    center.addObserver(self, selector: #selector(sessionRuntimeError(_:)), name: .AVCaptureSessionRuntimeError, object: session)
    inBackground = UIApplication.shared.applicationState == .background
  }

  func update(running: Bool, front: Bool) {
    sessionQueue.async { [weak self] in
      guard let self = self else { return }
      self.wanted = running
      self.front = front
      self.reconcile()
    }
  }

  func update(torch: Bool) {
    sessionQueue.async { [weak self] in
      guard let self = self, self.torch != torch else { return }
      self.torch = torch
      self.applyTorch()
    }
  }

  func update(visible: Bool) {
    sessionQueue.async { [weak self] in
      self?.visible = visible
      self?.reconcile()
    }
  }

  func update(orientation: UIInterfaceOrientation) {
    sessionQueue.async { [weak self] in
      guard let self = self, self.orientation != orientation else { return }
      self.orientation = orientation
      self.orientConnections()
    }
  }

  func shutdown() {
    NotificationCenter.default.removeObserver(self)
    videoOutput.setSampleBufferDelegate(nil, queue: nil)
    sessionQueue.async { [session] in
      if session.isRunning {
        session.stopRunning()
      }
    }
  }

  private func reconcile() {
    guard wanted && visible && !inBackground else {
      stop()
      return
    }
    guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
      stop()
      if !reportedDenied {
        reportedDenied = true
        delegate?.camera(self, didFail: .cameraPermissionDenied, message: "Camera permission is not granted. Call requestCameraPermissionsAsync() first.")
      }
      return
    }
    reportedDenied = false
    guard configure() else {
      stop()
      return
    }
    if !session.isRunning {
      session.startRunning()
    }
    // The torch only stays on while the session runs, so it goes again after every start.
    applyTorch()
  }

  private func applyTorch() {
    guard let device = input?.device, device.hasTorch, session.isRunning else { return }
    let mode: AVCaptureDevice.TorchMode = torch ? .on : .off
    guard device.torchMode != mode, device.isTorchModeSupported(mode), (try? device.lockForConfiguration()) != nil else { return }
    device.torchMode = mode
    device.unlockForConfiguration()
  }

  private func stop() {
    if session.isRunning {
      session.stopRunning()
    }
  }

  private func configure() -> Bool {
    let position: AVCaptureDevice.Position = front ? .front : .back
    if input?.device.position == position && outputAdded {
      return true
    }
    session.beginConfiguration()
    defer { session.commitConfiguration() }

    if input?.device.position != position {
      if let old = input {
        session.removeInput(old)
        input = nil
      }
      guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
        let newInput = try? AVCaptureDeviceInput(device: device),
        session.canAddInput(newInput) else {
        delegate?.camera(self, didFail: .cameraUnavailable, message: "No usable \(front ? "front" : "back") camera.")
        return false
      }
      session.addInput(newInput)
      input = newInput
      delegate?.camera(self, hasTorch: device.hasTorch)
    }
    if session.canSetSessionPreset(.hd1280x720) {
      session.sessionPreset = .hd1280x720
    }

    if !outputAdded {
      // MediaPipe's MPImage takes BGRA sample buffers. The ISP converts for free.
      videoOutput.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
      videoOutput.alwaysDiscardsLateVideoFrames = true
      videoOutput.setSampleBufferDelegate(self, queue: videoQueue)
      guard session.canAddOutput(videoOutput) else {
        delegate?.camera(self, didFail: .cameraUnavailable, message: "Could not attach the camera output.")
        return false
      }
      session.addOutput(videoOutput)
      outputAdded = true
    }
    // A new input rebuilds the connections, so orientation and mirroring go again.
    orientConnections()
    return true
  }

  private func orientConnections() {
    if let connection = videoOutput.connection(with: .video) {
      Self.rotate(connection, to: orientation, front: front)
      if connection.isVideoMirroringSupported {
        connection.automaticallyAdjustsVideoMirroring = false
        connection.isVideoMirrored = false
      }
    }
    let orientation = self.orientation
    let front = self.front
    DispatchQueue.main.async { [weak previewLayer] in
      if let connection = previewLayer?.connection {
        Self.rotate(connection, to: orientation, front: front)
      }
    }
  }

  static func rotate(_ connection: AVCaptureConnection, to orientation: UIInterfaceOrientation, front: Bool) {
    if #available(iOS 17.0, *) {
      // Angles are sensor-relative and the front sensor is flipped in landscape. With the back
      // camera's angles the front image came out upside down (iPhone 11 Pro).
      let angle: CGFloat
      switch orientation {
      case .landscapeRight: angle = front ? 180 : 0
      case .landscapeLeft: angle = front ? 0 : 180
      case .portraitUpsideDown: angle = 270
      default: angle = 90
      }
      if connection.isVideoRotationAngleSupported(angle) {
        connection.videoRotationAngle = angle
      }
    } else if connection.isVideoOrientationSupported {
      connection.videoOrientation = AVCaptureVideoOrientation(rawValue: orientation.rawValue) ?? .portrait
    }
  }

  @objc private func didEnterBackground() {
    sessionQueue.async { [weak self] in
      self?.inBackground = true
      self?.reconcile()
    }
  }

  @objc private func willEnterForeground() {
    sessionQueue.async { [weak self] in
      self?.inBackground = false
      self?.reconcile()
    }
  }

  @objc private func sessionInterrupted(_ notification: Notification) {
    let raw = notification.userInfo?[AVCaptureSessionInterruptionReasonKey] as? Int
    let reason = raw.flatMap(AVCaptureSession.InterruptionReason.init(rawValue:))
    // Backgrounding is handled above and isn't worth an error.
    if reason == .videoDeviceNotAvailableInBackground {
      return
    }
    delegate?.camera(self, didFail: .cameraInterrupted, message: "The camera was interrupted (reason \(raw ?? -1)).")
  }

  @objc private func sessionRuntimeError(_ notification: Notification) {
    let error = notification.userInfo?[AVCaptureSessionErrorKey] as? AVError
    sessionQueue.async { [weak self] in
      // Sessions that were never asked to run (replay input, simulators) can still post these.
      guard let self = self, self.wanted else { return }
      self.delegate?.camera(self, didFail: .cameraUnavailable, message: error?.localizedDescription ?? "The camera session failed.")
      if error?.code == .mediaServicesWereReset {
        self.reconcile()
      }
    }
  }

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    delegate?.camera(self, didOutput: sampleBuffer)
  }

  func captureOutput(_ output: AVCaptureOutput, didDrop sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    delegate?.cameraDidDropFrame(self)
  }
}
