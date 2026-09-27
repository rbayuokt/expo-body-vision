import Foundation

/// BlazePose topology. Backends with other layouts map into it and leave missing joints at zero confidence.
enum Joint: Int, CaseIterable {
  case nose, leftEyeInner, leftEye, leftEyeOuter, rightEyeInner, rightEye, rightEyeOuter
  case leftEar, rightEar, mouthLeft, mouthRight
  case leftShoulder, rightShoulder, leftElbow, rightElbow, leftWrist, rightWrist
  case leftPinky, rightPinky, leftIndex, rightIndex, leftThumb, rightThumb
  case leftHip, rightHip, leftKnee, rightKnee, leftAnkle, rightAnkle
  case leftHeel, rightHeel, leftFootIndex, rightFootIndex

  static let count = 33

  static let names: [String] = [
    "nose", "leftEyeInner", "leftEye", "leftEyeOuter", "rightEyeInner", "rightEye", "rightEyeOuter",
    "leftEar", "rightEar", "mouthLeft", "mouthRight",
    "leftShoulder", "rightShoulder", "leftElbow", "rightElbow", "leftWrist", "rightWrist",
    "leftPinky", "rightPinky", "leftIndex", "rightIndex", "leftThumb", "rightThumb",
    "leftHip", "rightHip", "leftKnee", "rightKnee", "leftAnkle", "rightAnkle",
    "leftHeel", "rightHeel", "leftFootIndex", "rightFootIndex"
  ]

  private static let byName: [String: Joint] = Dictionary(
    uniqueKeysWithValues: names.enumerated().map { ($0.element, Joint(rawValue: $0.offset)!) }
  )

  static func named(_ name: String) -> Joint? {
    byName[name]
  }

  var name: String {
    Joint.names[rawValue]
  }

  var mirrored: Joint {
    let n = name
    if n.hasPrefix("left") { return Joint.named("right" + n.dropFirst(4)) ?? self }
    if n.hasPrefix("right") { return Joint.named("left" + n.dropFirst(5)) ?? self }
    if n == "mouthLeft" { return .mouthRight }
    if n == "mouthRight" { return .mouthLeft }
    return self
  }
}

struct Bone {
  let name: String
  let from: Joint
  let to: Joint
}

enum Skeleton {
  static let bones: [Bone] = [
    Bone(name: "shoulders", from: .leftShoulder, to: .rightShoulder),
    Bone(name: "hips", from: .leftHip, to: .rightHip),
    Bone(name: "leftTorso", from: .leftShoulder, to: .leftHip),
    Bone(name: "rightTorso", from: .rightShoulder, to: .rightHip),
    Bone(name: "leftUpperArm", from: .leftShoulder, to: .leftElbow),
    Bone(name: "leftForearm", from: .leftElbow, to: .leftWrist),
    Bone(name: "rightUpperArm", from: .rightShoulder, to: .rightElbow),
    Bone(name: "rightForearm", from: .rightElbow, to: .rightWrist),
    Bone(name: "leftThigh", from: .leftHip, to: .leftKnee),
    Bone(name: "leftShin", from: .leftKnee, to: .leftAnkle),
    Bone(name: "rightThigh", from: .rightHip, to: .rightKnee),
    Bone(name: "rightShin", from: .rightKnee, to: .rightAnkle),
    Bone(name: "leftHand", from: .leftWrist, to: .leftIndex),
    Bone(name: "rightHand", from: .rightWrist, to: .rightIndex),
    Bone(name: "leftFoot", from: .leftAnkle, to: .leftFootIndex),
    Bone(name: "rightFoot", from: .rightAnkle, to: .rightFootIndex),
    Bone(name: "leftHeel", from: .leftAnkle, to: .leftHeel),
    Bone(name: "rightHeel", from: .rightAnkle, to: .rightHeel)
  ]

  /// Joints drawn as dots. Face and finger points stay out of the default skeleton.
  static let drawnJoints: [Joint] = [
    .nose, .leftShoulder, .rightShoulder, .leftElbow, .rightElbow, .leftWrist, .rightWrist,
    .leftHip, .rightHip, .leftKnee, .rightKnee, .leftAnkle, .rightAnkle
  ]
}
