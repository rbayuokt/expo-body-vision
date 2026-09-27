Pod::Spec.new do |s|
  s.name           = 'DemoPoseBackends'
  s.version        = '1.0.0'
  s.summary        = 'Example pose backends for expo-body-vision'
  s.author         = 'example'
  s.homepage       = 'https://example.invalid'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoBodyVision'
  s.frameworks = 'Vision', 'CoreMedia'
  s.source_files = '*.swift'
end
