package expo.modules.bodyvision.core

/** BlazePose topology. Backends with other layouts map into it and leave missing joints at zero confidence. */
@Suppress("EnumEntryName")
enum class Joint {
  nose, leftEyeInner, leftEye, leftEyeOuter, rightEyeInner, rightEye, rightEyeOuter,
  leftEar, rightEar, mouthLeft, mouthRight,
  leftShoulder, rightShoulder, leftElbow, rightElbow, leftWrist, rightWrist,
  leftPinky, rightPinky, leftIndex, rightIndex, leftThumb, rightThumb,
  leftHip, rightHip, leftKnee, rightKnee, leftAnkle, rightAnkle,
  leftHeel, rightHeel, leftFootIndex, rightFootIndex
}

const val JOINT_COUNT = 33

private val jointsByName = Joint.entries.associateBy { it.name }

fun jointNamed(name: String): Joint? = jointsByName[name]

val Joint.mirrored: Joint
  get() {
    val n = name
    if (n.startsWith("left")) return jointNamed("right" + n.substring(4)) ?: this
    if (n.startsWith("right")) return jointNamed("left" + n.substring(5)) ?: this
    if (n == "mouthLeft") return Joint.mouthRight
    if (n == "mouthRight") return Joint.mouthLeft
    return this
  }

data class Bone(val name: String, val from: Joint, val to: Joint)

object Skeleton {
  val bones: List<Bone> = listOf(
    Bone("shoulders", Joint.leftShoulder, Joint.rightShoulder),
    Bone("hips", Joint.leftHip, Joint.rightHip),
    Bone("leftTorso", Joint.leftShoulder, Joint.leftHip),
    Bone("rightTorso", Joint.rightShoulder, Joint.rightHip),
    Bone("leftUpperArm", Joint.leftShoulder, Joint.leftElbow),
    Bone("leftForearm", Joint.leftElbow, Joint.leftWrist),
    Bone("rightUpperArm", Joint.rightShoulder, Joint.rightElbow),
    Bone("rightForearm", Joint.rightElbow, Joint.rightWrist),
    Bone("leftThigh", Joint.leftHip, Joint.leftKnee),
    Bone("leftShin", Joint.leftKnee, Joint.leftAnkle),
    Bone("rightThigh", Joint.rightHip, Joint.rightKnee),
    Bone("rightShin", Joint.rightKnee, Joint.rightAnkle),
    Bone("leftHand", Joint.leftWrist, Joint.leftIndex),
    Bone("rightHand", Joint.rightWrist, Joint.rightIndex),
    Bone("leftFoot", Joint.leftAnkle, Joint.leftFootIndex),
    Bone("rightFoot", Joint.rightAnkle, Joint.rightFootIndex),
    Bone("leftHeel", Joint.leftAnkle, Joint.leftHeel),
    Bone("rightHeel", Joint.rightAnkle, Joint.rightHeel)
  )

  /** Joints drawn as dots. Face and finger points stay out of the default skeleton. */
  val drawnJoints: List<Joint> = listOf(
    Joint.nose, Joint.leftShoulder, Joint.rightShoulder, Joint.leftElbow, Joint.rightElbow,
    Joint.leftWrist, Joint.rightWrist, Joint.leftHip, Joint.rightHip, Joint.leftKnee, Joint.rightKnee,
    Joint.leftAnkle, Joint.rightAnkle
  )
}
