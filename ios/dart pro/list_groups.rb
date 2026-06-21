require 'xcodeproj'
project = Xcodeproj::Project.open('/Users/greego/Desktop/dart pro/ios/dart pro/dart pro.xcodeproj')
project.main_group.children.each do |child|
  puts "#{child.class}: name=#{child.name}, path=#{child.path}"
end
