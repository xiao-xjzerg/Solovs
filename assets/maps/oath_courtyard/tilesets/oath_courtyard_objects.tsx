<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.12.2" name="oath_courtyard_objects" tilewidth="832" tileheight="384" tilecount="11" columns="0">
 <grid orientation="orthogonal" width="1" height="1"/>
 <tile id="0" type="CourtyardAsset">
  <properties>
   <property name="assetType" value="wall"/>
   <property name="collision" type="bool" value="true"/>
  </properties>
  <image source="objects/wall_full.png" width="832" height="320"/>
  <objectgroup draworder="index">
   <object id="1" type="Collider" x="67" y="243" width="699" height="51"/>
  </objectgroup>
 </tile>
 <tile id="1" type="CourtyardAsset">
  <properties>
   <property name="assetType" value="landmark"/>
   <property name="collision" type="bool" value="true"/>
  </properties>
  <image source="objects/monument.png" width="360" height="384"/>
  <objectgroup draworder="index">
   <object id="1" type="Collider" x="72" y="300" width="216" height="61"/>
  </objectgroup>
 </tile>
 <tile id="2" type="CourtyardAsset">
  <properties>
   <property name="assetType" value="wall_module"/>
   <property name="collision" type="bool" value="true"/>
  </properties>
  <image source="objects/wall_left.png" width="384" height="288"/>
  <objectgroup draworder="index">
   <object id="1" type="Collider" x="31" y="219" width="323" height="46"/>
  </objectgroup>
 </tile>
 <tile id="3" type="CourtyardAsset">
  <properties>
   <property name="assetType" value="wall_module"/>
   <property name="collision" type="bool" value="true"/>
  </properties>
  <image source="objects/wall_middle.png" width="384" height="288"/>
  <objectgroup draworder="index">
   <object id="1" type="Collider" x="31" y="219" width="323" height="46"/>
  </objectgroup>
 </tile>
 <tile id="4" type="CourtyardAsset">
  <properties>
   <property name="assetType" value="wall_module"/>
   <property name="collision" type="bool" value="true"/>
  </properties>
  <image source="objects/wall_right.png" width="384" height="288"/>
  <objectgroup draworder="index">
   <object id="1" type="Collider" x="31" y="219" width="323" height="46"/>
  </objectgroup>
 </tile>
 <tile id="5" type="CourtyardAsset">
  <properties>
   <property name="assetType" value="rock_cluster"/>
   <property name="collision" type="bool" value="true"/>
  </properties>
  <image source="objects/rock_cluster.png" width="256" height="160"/>
  <objectgroup draworder="index">
   <object id="1" type="Collider" x="38" y="115" width="179" height="32">
    <ellipse/>
   </object>
  </objectgroup>
 </tile>
 <tile id="6" type="CourtyardAsset">
  <properties>
   <property name="assetType" value="boulder"/>
   <property name="collision" type="bool" value="true"/>
  </properties>
  <image source="objects/boulder.png" width="160" height="176"/>
  <objectgroup draworder="index" id="2">
   <object id="1" type="Collider" x="5.22638" y="114.797" width="162.689" height="61.2831">
    <ellipse/>
   </object>
  </objectgroup>
 </tile>
 <tile id="7" type="CourtyardAsset">
  <properties>
   <property name="assetType" value="shrub"/>
   <property name="collision" type="bool" value="false"/>
   <property name="sortOffsetY" type="int" value="-40"/>
  </properties>
  <image source="objects/shrub_small.png" width="128" height="104"/>
 </tile>
 <tile id="8" type="CourtyardAsset">
  <properties>
   <property name="assetType" value="shrub"/>
   <property name="collision" type="bool" value="false"/>
   <property name="sortOffsetY" type="int" value="-48"/>
  </properties>
  <image source="objects/shrub_large.png" width="184" height="136"/>
 </tile>
 <tile id="9" type="CourtyardAsset">
  <properties>
   <property name="assetType" value="grass"/>
   <property name="collision" type="bool" value="false"/>
   <property name="sortOffsetY" type="int" value="-36"/>
  </properties>
  <image source="objects/grass_small.png" width="112" height="104"/>
 </tile>
 <tile id="10" type="CourtyardAsset">
  <properties>
   <property name="assetType" value="grass"/>
   <property name="collision" type="bool" value="false"/>
   <property name="sortOffsetY" type="int" value="-44"/>
  </properties>
  <image source="objects/grass_wide.png" width="224" height="120"/>
 </tile>
</tileset>
