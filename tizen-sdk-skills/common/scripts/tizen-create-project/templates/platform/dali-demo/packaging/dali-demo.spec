Name:       dali-demo
Summary:    Minimal DALi demo application (C++17)
Version:    1.0.0
Release:    1
Group:      Applications/Graphics
License:    Apache-2.0
Source0:    %{name}-%{version}.tar.gz

BuildRequires: cmake
BuildRequires: gcc-c++
BuildRequires: pkgconfig(dali2-core)
BuildRequires: pkgconfig(dali2-adaptor)
BuildRequires: pkgconfig(dali2-toolkit)

%description
Minimal DALi (Dynamic Animation Library) demo that renders an animated
"Hello DALi!" text label. Built with C++17 as required by DALi headers.

%prep
%setup -q

%build
cmake . -DCMAKE_INSTALL_PREFIX=%{_prefix} -DCMAKE_BUILD_TYPE=Release
make %{?_smp_mflags}

%install
rm -rf %{buildroot}
make install DESTDIR=%{buildroot}

%files
%defattr(-,root,root,-)
%{_bindir}/dali-demo
