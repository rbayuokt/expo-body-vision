require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoBodyVision'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.license        = package['license']
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: package['repository'], tag: "v#{s.version}" }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'MediaPipeTasksVision', '1.0.0'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.frameworks = 'AVFoundation', 'CoreMedia', 'QuartzCore'
  s.source_files = '*.swift', 'Core/*.swift'
  s.resource_bundles = { 'ExpoBodyVisionModels' => ['Models/*.task'] }
end
