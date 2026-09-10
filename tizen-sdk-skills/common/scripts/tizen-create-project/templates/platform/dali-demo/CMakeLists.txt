cmake_minimum_required(VERSION 3.8)
project(dali-demo CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(PkgConfig REQUIRED)
pkg_check_modules(DALI REQUIRED dali2-core dali2-adaptor dali2-toolkit)

add_executable(dali-demo src/main.cpp)
target_include_directories(dali-demo PRIVATE ${DALI_INCLUDE_DIRS})
target_link_libraries(dali-demo ${DALI_LIBRARIES})

install(TARGETS dali-demo RUNTIME DESTINATION bin)
