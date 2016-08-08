package com.classes;

/**
 * Created by Austen on 01/08/2016.
 */
public class Ingredient extends BaseItem {

//    private String name;
    private Boolean isSelected;

//    public String getName()
//    { return name; }
//
//    public void setName(String value)
//    { name = value; }

    public Boolean getIsSelected()
    { return isSelected; }

    public void setIsSelected(Boolean value)
    { isSelected = value; }

    // Toggles whatever the isSelected value is currently set to
    public void setIsSelected()
    { isSelected = !isSelected; }

    @Override
    public String toString()
    {
        return name;
    }

    public Ingredient(String name, Boolean isSelected)
    {
        this.name = name;
        this.isSelected = isSelected;
    }
}
